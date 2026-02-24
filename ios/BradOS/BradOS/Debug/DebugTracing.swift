import Foundation
#if DEBUG
import OpenTelemetryApi
#endif

/// Span kind for debug tracing (mirrors OTel SpanKind without requiring OTel import at call sites).
enum DebugSpanKind {
    case client, server, producer, consumer, `internal`

    #if DEBUG
    var otelKind: OpenTelemetryApi.SpanKind {
        switch self {
        case .client: return .client
        case .server: return .server
        case .producer: return .producer
        case .consumer: return .consumer
        case .internal: return .internal
        }
    }
    #endif
}

/// Handle to an active span. All methods are no-ops in release builds.
struct DebugSpanHandle {
    #if DEBUG
    private let span: OpenTelemetryApi.Span?

    init(span: OpenTelemetryApi.Span?) {
        self.span = span
    }
    #else
    init() {}
    #endif

    func setAttribute(key: String, value: String) {
        #if DEBUG
        span?.setAttribute(key: key, value: value)
        #endif
    }

    func addEvent(name: String) {
        #if DEBUG
        span?.addEvent(name: name)
        #endif
    }

    func setError(_ error: Error) {
        #if DEBUG
        span?.status = .error(description: error.localizedDescription)
        #endif
    }

    func end() {
        #if DEBUG
        span?.end()
        #endif
    }
}

/// Debug tracing utilities. All methods return no-op handles in release builds.
enum DebugTracing {
    static func startSpan(
        _ name: String,
        kind: DebugSpanKind = .client,
        attributes: [String: String] = [:]
    ) -> DebugSpanHandle {
        #if DEBUG
        let span = DebugTelemetry.shared.startOTelSpan(
            name: name,
            kind: kind.otelKind,
            attributes: attributes
        )
        return DebugSpanHandle(span: span)
        #else
        return DebugSpanHandle()
        #endif
    }
}
