use serde::{Deserialize, Serialize};

use super::{NativeToolCall, ProviderError, ProviderUsage};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunPhase {
    Thinking,
    AwaitingApproval,
    ExecutingTool,
    Completed,
    Cancelled,
    Failed,
}

impl RunPhase {
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Completed | Self::Cancelled | Self::Failed)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunBudget {
    pub max_rounds: u32,
    pub max_tool_calls: u32,
    pub max_total_tokens: u64,
}

impl Default for RunBudget {
    fn default() -> Self {
        Self {
            max_rounds: 8,
            max_tool_calls: 24,
            max_total_tokens: 64_000,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRun {
    pub id: String,
    pub goal: String,
    pub phase: RunPhase,
    pub round: u32,
    pub tool_calls: u32,
    pub usage: ProviderUsage,
    pub budget: RunBudget,
    pub pending_tool: Option<NativeToolCall>,
    pub error: Option<ProviderError>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum RunAction {
    BeginRound,
    RequestApproval(NativeToolCall),
    StartTool(NativeToolCall),
    FinishTool,
    RecordUsage(ProviderUsage),
    Complete,
    Cancel,
    Fail(ProviderError),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TransitionError {
    TerminalRun,
    InvalidPhase {
        from: RunPhase,
        action: &'static str,
    },
    RoundBudgetExceeded,
    ToolBudgetExceeded,
    TokenBudgetExceeded,
}

impl AgentRun {
    pub fn new(id: impl Into<String>, goal: impl Into<String>, budget: RunBudget) -> Self {
        Self {
            id: id.into(),
            goal: goal.into(),
            phase: RunPhase::Thinking,
            round: 0,
            tool_calls: 0,
            usage: ProviderUsage::default(),
            budget,
            pending_tool: None,
            error: None,
        }
    }

    pub fn apply(&mut self, action: RunAction) -> Result<(), TransitionError> {
        if self.phase.is_terminal() {
            return Err(TransitionError::TerminalRun);
        }

        match action {
            RunAction::BeginRound => {
                if !matches!(self.phase, RunPhase::Thinking) {
                    return self.invalid("begin_round");
                }
                if self.round >= self.budget.max_rounds {
                    return Err(TransitionError::RoundBudgetExceeded);
                }
                self.round += 1;
            }
            RunAction::RequestApproval(call) => {
                if !matches!(self.phase, RunPhase::Thinking) {
                    return self.invalid("request_approval");
                }
                self.ensure_tool_budget()?;
                self.pending_tool = Some(call);
                self.phase = RunPhase::AwaitingApproval;
            }
            RunAction::StartTool(call) => {
                if !matches!(self.phase, RunPhase::Thinking | RunPhase::AwaitingApproval) {
                    return self.invalid("start_tool");
                }
                self.ensure_tool_budget()?;
                self.tool_calls += 1;
                self.pending_tool = Some(call);
                self.phase = RunPhase::ExecutingTool;
            }
            RunAction::FinishTool => {
                if self.phase != RunPhase::ExecutingTool {
                    return self.invalid("finish_tool");
                }
                self.pending_tool = None;
                self.phase = RunPhase::Thinking;
            }
            RunAction::RecordUsage(usage) => {
                // Provider input usage is the size of the complete context sent for
                // that round. Adding it on every tool round double-counts the same
                // history and can stop an otherwise safe run just because several
                // tools were called. Treat the input side as a context high-water
                // mark while keeping newly generated output cumulative.
                let next_input_tokens = self.usage.input_tokens.max(usage.input_tokens);
                let next_output_tokens =
                    self.usage.output_tokens.saturating_add(usage.output_tokens);
                let total = next_input_tokens.saturating_add(next_output_tokens);
                if total > self.budget.max_total_tokens {
                    return Err(TransitionError::TokenBudgetExceeded);
                }
                self.usage.input_tokens = next_input_tokens;
                self.usage.output_tokens = next_output_tokens;
            }
            RunAction::Complete => self.phase = RunPhase::Completed,
            RunAction::Cancel => self.phase = RunPhase::Cancelled,
            RunAction::Fail(error) => {
                self.error = Some(error);
                self.phase = RunPhase::Failed;
            }
        }
        Ok(())
    }

    fn ensure_tool_budget(&self) -> Result<(), TransitionError> {
        if self.tool_calls >= self.budget.max_tool_calls {
            Err(TransitionError::ToolBudgetExceeded)
        } else {
            Ok(())
        }
    }

    fn invalid<T>(&self, action: &'static str) -> Result<T, TransitionError> {
        Err(TransitionError::InvalidPhase {
            from: self.phase,
            action,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn call() -> NativeToolCall {
        NativeToolCall {
            id: "call-1".into(),
            name: "clearAll".into(),
            arguments: serde_json::json!({}),
        }
    }

    #[test]
    fn approval_tool_and_completion_follow_valid_path() {
        let mut run = AgentRun::new("run-1", "clear scene", RunBudget::default());
        run.apply(RunAction::BeginRound).unwrap();
        run.apply(RunAction::RequestApproval(call())).unwrap();
        run.apply(RunAction::StartTool(call())).unwrap();
        run.apply(RunAction::FinishTool).unwrap();
        run.apply(RunAction::Complete).unwrap();
        assert_eq!(run.phase, RunPhase::Completed);
        assert_eq!(run.tool_calls, 1);
    }

    #[test]
    fn budgets_are_enforced_before_side_effects() {
        let budget = RunBudget {
            max_rounds: 0,
            max_tool_calls: 0,
            max_total_tokens: 10,
        };
        let mut run = AgentRun::new("run-1", "goal", budget);
        assert_eq!(
            run.apply(RunAction::BeginRound),
            Err(TransitionError::RoundBudgetExceeded)
        );
        assert_eq!(
            run.apply(RunAction::StartTool(call())),
            Err(TransitionError::ToolBudgetExceeded)
        );
        assert_eq!(
            run.apply(RunAction::RecordUsage(ProviderUsage {
                input_tokens: 8,
                output_tokens: 3,
            })),
            Err(TransitionError::TokenBudgetExceeded)
        );
    }

    #[test]
    fn repeated_rounds_do_not_double_count_shared_input_context() {
        let budget = RunBudget {
            max_rounds: 8,
            max_tool_calls: 24,
            max_total_tokens: 12,
        };
        let mut run = AgentRun::new("run-1", "goal", budget);

        run.apply(RunAction::RecordUsage(ProviderUsage {
            input_tokens: 8,
            output_tokens: 1,
        }))
        .unwrap();
        run.apply(RunAction::RecordUsage(ProviderUsage {
            input_tokens: 9,
            output_tokens: 1,
        }))
        .unwrap();

        assert_eq!(run.usage.input_tokens, 9);
        assert_eq!(run.usage.output_tokens, 2);
        assert_eq!(run.usage.total_tokens(), 11);
    }

    #[test]
    fn terminal_runs_reject_further_actions() {
        let mut run = AgentRun::new("run-1", "goal", RunBudget::default());
        run.apply(RunAction::Cancel).unwrap();
        assert_eq!(
            run.apply(RunAction::Complete),
            Err(TransitionError::TerminalRun)
        );
    }
}
