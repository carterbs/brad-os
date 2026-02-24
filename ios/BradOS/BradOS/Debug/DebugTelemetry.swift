import Foundation
#if DEBUG
import OpenTelemetryApi
import OpenTelemetrySdk
#endif

/// Central debug telemetry manager. All methods are no-ops in release builds.
final class DebugTelemetry {
    static let shared = DebugTelemetry()

    #if DEBUG
    private var tracerProvider: TracerProvider?
    private var loggerProvider: LoggerProvider?
    private var tracer: OpenTelemetryApi.Tracer?
    private var logger: OpenTelemetryApi.Logger?
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

        // NOTE: Verify OTel API compatibility at build time
        let resource = Resource(attributes: [
            "service.name": .string("brad-os-ios"),
            "simulator.udid": .string(udid),
            "simulator.name": .string(deviceName)
        ])

        // Configure span exporter
        let spanExporter = DebugSpanExporter()
        let spanProcessor = SimpleSpanProcessor(spanExporter: spanExporter)
        let tracerProviderBuilder = TracerProviderBuilder()
            .add(spanProcessor: spanProcessor)
            .with(resource: resource)
        let tp = tracerProviderBuilder.build()
        self.tracerProvider = tp
        OpenTelemetry.registerTracerProvider(tracerProvider: tp)
        self.tracer = tp.get(instrumentationName: "brad-os-ios", instrumentationVersion: "1.0.0")

        // Configure log exporter
        let logExporter = DebugLogExporter()
        let logProcessor = SimpleLogRecordProcessor(logRecordExporter: logExporter)
        // NOTE: Verify OTel API compatibility at build time
        let loggerProviderBuilder = LoggerProviderBuilder()
            .with(resource: resource)
            .with(processors: [logProcessor])
        let lp = loggerProviderBuilder.build()
        self.loggerProvider = lp
        OpenTelemetry.registerLoggerProvider(loggerProvider: lp)
        self.logger = lp.get(instrumentationName: "brad-os-ios")

        print("[DebugTelemetry] Initialized with UDID: \(udid)")
        #endif
    }

    /// Flush pending telemetry. Call when app goes to background.
    func flush() {
        #if DEBUG
        // Force export any buffered spans/logs
        if let tp = tracerProvider as? TracerProviderSdk {
            tp.forceFlush()
        }
        #endif
    }

    /// Shut down providers. Call on app termination.
    func shutdown() {
        #if DEBUG
        if let tp = tracerProvider as? TracerProviderSdk {
            tp.shutdown()
        }
        #endif
    }

    // MARK: - Internal API (used by DebugLogger and DebugTracing)

    #if DEBUG
    func log(severity: Severity, message: String, attributes: [String: String]) {
        guard let logger = self.logger else { return }
        // NOTE: Verify OTel API compatibility at build time
        var builder = logger.logRecordBuilder()
        builder.setSeverity(severity)
        builder.setBody(.string(message))
        for (key, value) in attributes {
            builder.setAttributes([key: .string(value)])
        }
        builder.emit()
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
        var builder = tracer.spanBuilder(spanName: name)
            .setSpanKind(spanKind: kind)
        for (key, value) in attributes {
            builder = builder.setAttribute(key: key, value: value)
        }
        return builder.startSpan()
    }
    #endif
}
