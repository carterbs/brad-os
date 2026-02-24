#if DEBUG
import Foundation
import OpenTelemetrySdk

/// Exports spans to the local collector as JSON over HTTP.
final class DebugSpanExporter: SpanExporter {
    private let endpoint = URL(string: "http://localhost:4318/v1/traces")!
    private let session: URLSession

    init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 5
        config.connectionProxyDictionary = [:]
        self.session = URLSession(configuration: config)
    }

    func export(spans: [SpanData]) -> SpanExporterResultCode {
        guard !spans.isEmpty else { return .success }

        let resourceSpans = buildResourceSpans(from: spans)
        let body: [String: Any] = ["resourceSpans": resourceSpans]

        guard let jsonData = try? JSONSerialization.data(withJSONObject: body) else {
            return .failure
        }

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = jsonData

        // Fire and forget - don't block on network
        session.dataTask(with: request).resume()
        return .success
    }

    func flush() -> SpanExporterResultCode { .success }
    func shutdown() {}

    private func buildResourceSpans(from spans: [SpanData]) -> [[String: Any]] {
        var grouped: [String: (resource: [String: Any], spans: [[String: Any]])] = [:]

        for span in spans {
            let resourceKey = span.resource.attributes.description
            if grouped[resourceKey] == nil {
                let resourceAttrs = span.resource.attributes.map { key, value in
                    ["key": key, "value": ["stringValue": value.description]]
                }
                grouped[resourceKey] = (resource: ["attributes": resourceAttrs], spans: [])
            }

            let spanDict: [String: Any] = [
                "name": span.name,
                "traceId": span.traceId.hexString,
                "spanId": span.spanId.hexString,
                "startTimeUnixNano": String(span.startTime.timeIntervalSince1970 * 1_000_000_000),
                "endTimeUnixNano": String(span.endTime.timeIntervalSince1970 * 1_000_000_000),
                "kind": spanKindToInt(span.kind),
                "status": ["code": statusToInt(span.status)],
                "attributes": span.attributes.map { key, value in
                    ["key": key, "value": ["stringValue": value.description]]
                }
            ]
            grouped[resourceKey]?.spans.append(spanDict)
        }

        return grouped.values.map { entry in
            [
                "resource": entry.resource,
                "scopeSpans": [["spans": entry.spans]]
            ]
        }
    }

    private func spanKindToInt(_ kind: SpanKind) -> Int {
        switch kind {
        case .internal: return 1
        case .server: return 2
        case .client: return 3
        case .producer: return 4
        case .consumer: return 5
        }
    }

    private func statusToInt(_ status: SpanData.Status) -> Int {
        switch status {
        case .unset: return 0
        case .ok: return 1
        case .error: return 2
        }
    }
}
#endif
