import Foundation
#if DEBUG
import OpenTelemetryApi
import OpenTelemetrySdk
#endif

/// Central debug telemetry manager. All methods are no-ops in release builds.
final class DebugTelemetry {
    static let shared = DebugTelemetry()

    #if DEBUG
    private var tracerProviderSdk: TracerProviderSdk?
    private var loggerProviderSdk: LoggerProviderSdk?
    private var tracer: OpenTelemetryApi.Tracer?
    private var otelLogger: OpenTelemetryApi.Logger?
    private var isSetUp = false
    #endif

    private init() {}

    /// Initialize OTel providers. Call once at app startup.
    func setup() {
        #if DEBUG
        guard !isSetUp else { return }
        isSetUp = true

        // Get simulator UDID for resource attributes
        let udid = ProcessInfo.processInfo.environment["SIMULATOR_UDID"] ?? "unknown"
        let deviceName = ProcessInfo.processInfo.environment["SIMULATOR_DEVICE_NAME"] ?? "unknown"

        let resource = Resource(attributes: [
            "service.name": .string("brad-os-ios"),
            "simulator.udid": .string(udid),
            "simulator.name": .string(deviceName)
        ])

        // Configure tracer provider with span exporter
        let spanExporter = DebugSpanExporter()
        let spanProcessor = SimpleSpanProcessor(spanExporter: spanExporter)
        let tp = TracerProviderSdk(resource: resource, spanProcessors: [spanProcessor])
        self.tracerProviderSdk = tp
        OpenTelemetry.registerTracerProvider(tracerProvider: tp)
        self.tracer = tp.get(instrumentationName: "brad-os-ios", instrumentationVersion: "1.0.0")

        // Configure logger provider with log exporter
        let logExporter = DebugLogExporter()
        let logProcessor = SimpleLogRecordProcessor(logRecordExporter: logExporter)
        let lp = LoggerProviderSdk(resource: resource, logRecordProcessors: [logProcessor])
        self.loggerProviderSdk = lp
        OpenTelemetry.registerLoggerProvider(loggerProvider: lp)
        self.otelLogger = lp.loggerBuilder(instrumentationScopeName: "brad-os-ios").build()

        print("[DebugTelemetry] Initialized with UDID: \(udid)")
        #endif
    }

    /// Flush pending telemetry. Call when app goes to background.
    func flush() {
        #if DEBUG
        tracerProviderSdk?.forceFlush()
        #endif
    }

    /// Shut down providers. Call on app termination.
    func shutdown() {
        #if DEBUG
        tracerProviderSdk?.shutdown()
        #endif
    }

    // MARK: - Internal API (used by DebugLogger and DebugTracing)

    #if DEBUG
    func log(severity: Severity, message: String, attributes: [String: String]) {
        guard let otelLogger = self.otelLogger else { return }
        let otelAttrs = attributes.mapValues { AttributeValue.string($0) }
        otelLogger.logRecordBuilder()
            .setSeverity(severity)
            .setBody(.string(message))
            .setAttributes(otelAttrs)
            .emit()
    }

    func startOTelSpan(
        name: String,
        kind: OpenTelemetryApi.SpanKind,
        attributes: [String: String]
    ) -> OpenTelemetryApi.Span {
        guard let tracer = self.tracer else {
            return OpenTelemetry.instance.tracerProvider
                .get(instrumentationName: "noop")
                .spanBuilder(spanName: name)
                .startSpan()
        }
        let builder = tracer.spanBuilder(spanName: name)
            .setSpanKind(spanKind: kind)
        for (key, value) in attributes {
            builder.setAttribute(key: key, value: value)
        }
        return builder.startSpan()
    }
    #endif
}
