import Testing
@testable import Brad_OS
import BradOSCore
import Foundation

@Suite("TextToSpeechViewModel")
struct TextToSpeechViewModelTests {

    @Test("canPlay false for blank text or non-idle state")
    @MainActor
    func canPlayRequiresTextAndIdleState() {
        let vm = TextToSpeechViewModel(audioEngine: MockTTSAudioEngine())

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
        let vm = TextToSpeechViewModel(audioEngine: engine)
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
        let vm = TextToSpeechViewModel(audioEngine: engine)
        vm.text = "  hello   "
        vm.errorMessage = "existing error"

        vm.generateAndPlay()
        try? await Task.sleep(nanoseconds: 50_000_000)

        #expect(vm.state == .playing)
        #expect(vm.errorMessage == nil)
        #expect(engine.playCallCount == 1)
        #expect(engine.lastPlayedText == "  hello   ")
    }

    @Test("audio engine stop resets state to idle")
    @MainActor
    func stopResetsStateToIdle() {
        let engine = MockTTSAudioEngine()
        let vm = TextToSpeechViewModel(audioEngine: engine)
        vm.state = .playing

        vm.stop()

        #expect(vm.state == .idle)
        #expect(engine.stopCallCount == 1)
    }
}
