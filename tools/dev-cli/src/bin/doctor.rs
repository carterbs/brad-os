use std::process;

use dev_cli::doctor;

fn main() {
    let fast_mode = std::env::var("BRAD_DOCTOR_FAST")
        .is_ok_and(|value| value == "1");
    let context = doctor::RuntimeContext::current();

    let mut stdout = std::io::stdout();
    let code = match doctor::run(&mut stdout, fast_mode, doctor::probe_tool, &context) {
        Ok(code) => code,
        Err(err) => {
            eprintln!("{err}");
            1
        }
    };

    process::exit(code);
}
