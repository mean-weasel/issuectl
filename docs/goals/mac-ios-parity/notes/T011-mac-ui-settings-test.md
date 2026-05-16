# T011 Worker Receipt: Mac UI Settings Test Attempt

## Result

Blocked.

I attempted to add deterministic Mac UI coverage by bypassing the status-menu path with a UI-testing-only launch hook that opened Settings directly. The focused test compiled after removing the cross-target mock-server dependency, but still hung during execution and had to be interrupted.

## Evidence

- First attempt failed to compile because `MockIssueCTLServer` is not part of the `IssueCTLMacUITests` target.
- Second attempt removed that dependency and used the existing unreachable test URL, but `xcodebuild ... test -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testSettingsShowsNativeRepositoryManagement` still hung after launch and produced no test result before interruption.

## Cleanup

The UI-testing launch hook and hanging UI test were removed from the worktree. No product or test code from the failed UI-test experiment remains.

## Blocker

Mac accessory app UI automation remains unreliable for settings-window verification in this environment. PR #423 should stay draft until either:

- the user dogfoods the settings repo workflow locally and accepts that evidence, or
- a separate Mac UI automation investigation finds a non-hanging settings-window harness.
