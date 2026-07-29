fn main() {
    // Re-embed the production frontend whenever Vite output changes.
    println!("cargo:rerun-if-changed=../dist");
    tauri_build::build()
}
