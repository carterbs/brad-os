import SwiftUI
import HealthKit
import WatchKit

@main
struct BradOSWatchApp: App {
    @WKApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            WorkoutView()
                .environmentObject(appDelegate.workoutManager)
        }
    }
}

class AppDelegate: NSObject, WKApplicationDelegate {
    let workoutManager = WorkoutManager()

    /// Called when the app launches
    func applicationDidFinishLaunching() {
        #if DEBUG
        print("[AppDelegate] Brad OS Watch app launched")
        #endif
    }

    /// Called when a workout configuration is sent from iOS (for mirrored sessions)
    /// Note: This is used for HKWorkoutSession mirroring, which we're not using
    /// in favor of WatchConnectivity for more control
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        Task {
            do {
                try await workoutManager.startWorkout(with: workoutConfiguration)
                #if DEBUG
                print("[AppDelegate] Started mirrored workout: \(workoutConfiguration.activityType.rawValue)")
                #endif
            } catch {
                #if DEBUG
                print("[AppDelegate] Failed to start mirrored workout: \(error)")
                #endif
            }
        }
    }
}
