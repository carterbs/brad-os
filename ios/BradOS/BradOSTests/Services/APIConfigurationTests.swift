import Foundation
import Testing
@testable import Brad_OS

@Suite
struct APIConfigurationTests {
    @Test
    func customLocalURLSelectsStandaloneDevelopmentAPI() {
        let customURL = "http://127.0.0.1:8787/api/dev"

        let configuration = APIConfiguration.resolveDefault(
            environment: ["BRAD_OS_API_URL": customURL],
            isPhysicalDevice: false
        )

        #expect(configuration.baseURL == URL(string: customURL))
    }

    @Test
    func simulatorDefaultsToHostedDevelopmentAPI() {
        let configuration = APIConfiguration.resolveDefault(
            environment: [:],
            isPhysicalDevice: false
        )

        #expect(configuration.baseURL == URL(string: "https://brad-os.web.app/api/dev"))
    }

    @Test
    func physicalDeviceDefaultsToProductionAPI() {
        let configuration = APIConfiguration.resolveDefault(
            environment: [:],
            isPhysicalDevice: true
        )

        #expect(configuration.baseURL == URL(string: "https://brad-os.web.app/api/prod"))
    }
}
