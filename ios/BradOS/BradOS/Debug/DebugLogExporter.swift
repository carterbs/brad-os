#if DEBUG
import Foundation
import OpenTelemetrySdk

/// Exports log records to the local collector as JSON over HTTP.
final class DebugLogExporter: LogRecordExporter {
    // swiftlint:disable:next force_unwrapping
    private let endpoint = URL(string: "http://localhost:4318/v1/logs")!
    private let session: URLSession

    init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 5
        config.connectionProxyDictionary = [:]
        self.session = URLSession(configuration: config)
    }

    func export(logRecords: [ReadableLogRecord], explicitTimeout: TimeInterval?) -> ExportResult {
        guard !logRecords.isEmpty else { return .success }

        let resourceLogs = buildResourceLogs(from: logRecords)
        let body: [String: Any] = ["resourceLogs": resourceLogs]

        guard let jsonData = try? JSONSerialization.data(withJSONObject: body) else {
            return .failure
        }

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = jsonData

        session.dataTask(with: request).resume()
        return .success
    }

    func forceFlush(explicitTimeout: TimeInterval?) -> ExportResult { .success }
    func shutdown(explicitTimeout: TimeInterval?) {}

    private func buildResourceLogs(from records: [ReadableLogRecord]) -> [[String: Any]] {
        var result: [[String: Any]] = []
        for record in records {
            let resourceAttrs = record.resource.attributes.map { key, value in
                ["key": key, "value": ["stringValue": value.description]]
            }
            let logDict: [String: Any] = [
                "timeUnixNano": String(record.timestamp.timeIntervalSince1970 * 1_000_000_000),
                "severityText": record.severity?.description ?? "INFO",
                "body": ["stringValue": record.body?.description ?? ""],
                "attributes": record.attributes.map { key, value in
                    ["key": key, "value": ["stringValue": value.description]]
                }
            ]
            result.append([
                "resource": ["attributes": resourceAttrs],
                "scopeLogs": [["logRecords": [logDict]]]
            ])
        }
        return result
    }
}
#endif
