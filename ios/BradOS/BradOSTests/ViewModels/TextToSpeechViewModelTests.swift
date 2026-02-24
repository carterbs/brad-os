import Testing
@testable import BradOS
import BradOSCore
import Foundation

@Suite("TextToSpeechViewModel")
struct TextToSpeechViewModelTests {

    @Test("canPlay false for blank text or non-idle state")
    @MainActor
    func canPlayRequiresTextAndIdleState() {
        let vm = TextToSpeechViewModel(
            apiClient: MockAPIClient(),
            audioEngine: MockTTSAudioEngine()
        )

        #expect(vm.canPlay == false)

        vm.text = "Read this out loud"
        #expect(vm.canPlay == true)

        vm.state = .generating
        #expect(vm.canPlay == false)
    }

    @Test("generateAndPlay no-ops when canPlay is false")
    @MainActor
    func generateAndPlayNoopsWhenCannotPlay() async {
        let engine = MockTTSAudioEngine()
        let vm = TextToSpeechViewModel(apiClient: MockAPIClient(), audioEngine: engine)
        vm.text = ""

        vm.generateAndPlay()
        try? await Task.sleep(nanoseconds: 10_000_000)

        #expect(vm.state == .idle)
        #expect(engine.playCallCount == 0)
        #expect(vm.errorMessage == nil)
    }

    @Test("generateAndPlay success transitions to playing and clears error")
    @MainActor
    func generateAndPlaySuccessTransitionsToPlaying() async {
        let engine = MockTTSAudioEngine()
        let vm = TextToSpeechViewModel(apiClient: MockAPIClient(), audioEngine: engine)
        vm.text = "  hello   "
        vm.errorMessage = "existing error"

        vm.generateAndPlay()
        try? await Task.sleep(nanoseconds: 50_000_000)

        #expect(vm.state == .playing)
        #expect(vm.errorMessage == nil)
        #expect(engine.playCallCount == 1)
        #expect(engine.lastPlayedData != nil)
    }

    @Test("synthesize failure sets error and returns to idle")
    @MainActor
    func generateAndPlayFailureSetsError() async {
        let mock = MockAPIClient.failing(with: APIError.network(NSError(domain: "tts", code: -1)))
        let engine = MockTTSAudioEngine()
        let vm = TextToSpeechViewModel(apiClient: mock, audioEngine: engine)
        vm.text = "Hello"

        vm.generateAndPlay()
        try? await Task.sleep(nanoseconds: 50_000_000)

        #expect(vm.state == .idle)
        #expect(vm.errorMessage != nil)
        #expect(engine.playCallCount == 0)
    }

    @Test("audio engine stop resets state to idle")
    @MainActor
    func stopResetsStateToIdle() {
        let engine = MockTTSAudioEngine()
        let vm = TextToSpeechViewModel(apiClient: MockAPIClient(), audioEngine: engine)
        vm.state = .playing

        vm.stop()

        #expect(vm.state == .idle)
        #expect(engine.stopCallCount == 1)
    }
}
