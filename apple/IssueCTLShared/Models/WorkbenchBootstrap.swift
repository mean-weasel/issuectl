import Foundation

struct WorkbenchIssueKey: Hashable, Sendable {
    let owner: String
    let repo: String
    let number: Int

    var repoFullName: String { "\(owner)/\(repo)" }
    var displayID: String { "\(repoFullName)#\(number)" }
}

struct WorkbenchBootstrap: Sendable {
    let repos: [WorkbenchRepo]
    let generatedAt: String
    let issueSummariesByRepo: [String: [WorkbenchIssueSummary]]
    let issueLookup: [WorkbenchIssueKey: WorkbenchIssueSummary]
    let activeIssueDeploymentsByKey: [WorkbenchIssueKey: ActiveDeployment]
    let prioritiesByKey: [WorkbenchIssueKey: Priority]
    let usesCachedIssues: Bool
    let issueCachedDates: [Date]

    init(payload: WorkbenchPayload) {
        repos = payload.repos
        generatedAt = payload.generatedAt

        var summariesByRepo: [String: [WorkbenchIssueSummary]] = [:]
        var summaries: [WorkbenchIssueKey: WorkbenchIssueSummary] = [:]
        var activeDeployments: [WorkbenchIssueKey: ActiveDeployment] = [:]
        var priorities: [WorkbenchIssueKey: Priority] = [:]
        var cachedDates: [Date] = []
        var didUseCachedIssues = false

        for repo in payload.repos {
            let repoFullName = repo.fullName
            summariesByRepo[repoFullName] = repo.issues
            didUseCachedIssues = didUseCachedIssues || repo.issuesFromCache
            if let cachedAt = repo.issuesCachedAt, let date = parseIssueCTLDate(cachedAt) {
                cachedDates.append(date)
            }

            for issue in repo.issues {
                let key = WorkbenchIssueKey(owner: repo.owner, repo: repo.name, number: issue.number)
                summaries[key] = issue
                priorities[key] = issue.priority
            }

            for item in repo.priorities {
                guard item.repoId == repo.id else { continue }
                let key = WorkbenchIssueKey(owner: repo.owner, repo: repo.name, number: item.issueNumber)
                priorities[key] = item.priority
            }

            for deployment in repo.deployments where deployment.isActive && deployment.isIssueTarget {
                let key = WorkbenchIssueKey(owner: deployment.owner, repo: deployment.repoName, number: deployment.targetNumber)
                activeDeployments[key] = deployment
            }
        }

        issueSummariesByRepo = summariesByRepo
        issueLookup = summaries
        activeIssueDeploymentsByKey = activeDeployments
        prioritiesByKey = priorities
        usesCachedIssues = didUseCachedIssues
        issueCachedDates = cachedDates
    }

    func repo(owner: String, name: String) -> WorkbenchRepo? {
        repos.first { $0.owner == owner && $0.name == name }
    }

    func issueSummary(for key: WorkbenchIssueKey) -> WorkbenchIssueSummary? {
        issueLookup[key]
    }

    func activeIssueDeployment(for key: WorkbenchIssueKey) -> ActiveDeployment? {
        activeIssueDeploymentsByKey[key]
    }

    func priority(for key: WorkbenchIssueKey) -> Priority {
        prioritiesByKey[key] ?? .normal
    }

    var priorityMapByIssueIdentifier: [String: Priority] {
        Dictionary(uniqueKeysWithValues: prioritiesByKey.map { key, priority in
            (key.displayID, priority)
        })
    }

    func activeDeployment(owner: String, repo: String, number: Int) -> ActiveDeployment? {
        activeIssueDeployment(for: WorkbenchIssueKey(owner: owner, repo: repo, number: number))
    }

    var activeDeployments: [ActiveDeployment] {
        Array(activeIssueDeploymentsByKey.values)
    }
}
