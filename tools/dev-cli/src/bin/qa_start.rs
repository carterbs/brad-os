use std::env;
use std::path::Path;

use dev_cli::qa_start;

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let root_dir = env::var("ROOT_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| env::current_dir().unwrap_or_else(|_| Path::new("/").to_path_buf()));
    let qa_state_root = env::var("QA_STATE_ROOT").unwrap_or_else(|_| "/tmp/brad-os-qa".to_string());

    if let Err(err) = qa_start::run(&args, &root_dir, Path::new(&qa_state_root)) {
        eprintln!("{err}");
        std::process::exit(1);
    }
}
