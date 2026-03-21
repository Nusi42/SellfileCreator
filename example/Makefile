# Builds the C++ example against the debug .so (Linux/WSL only).
# Run `make` then `make run` to execute the smoke test.
#
# For Windows DLL, see the build instructions at the top of main.cpp.

CC     = g++
CFLAGS = -std=c++17 -O2 -Wall -Wextra
TARGET = run_example
SO     = ../wasm/target/debug/librule_engine_native.so

$(TARGET): main.cpp
	$(CC) $(CFLAGS) main.cpp -o $(TARGET) -ldl

.PHONY: so run clean

# Build the Rust .so first.
so:
	cargo build -p rule_engine_native --manifest-path ../wasm/Cargo.toml

# Build the Rust .so and C++ binary, then run the smoke test.
run: $(TARGET) so
	./$(TARGET) $(SO)

clean:
	rm -f $(TARGET)
