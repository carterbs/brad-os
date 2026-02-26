use std::process;

fn main() {
    let exit_code = dev_cli::integration_tests_runner::run_integration_tests();
    process::exit(exit_code);
}
