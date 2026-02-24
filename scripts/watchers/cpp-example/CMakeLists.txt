cmake_minimum_required(VERSION 3.20)
project(sellfile_creator_cpp_watcher LANGUAGES CXX)

# Use C++20 for filesystem + chrono conveniences.
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# websocketpp and nlohmann_json are expected via package manager (e.g. vcpkg).
find_package(websocketpp CONFIG REQUIRED)
find_package(nlohmann_json CONFIG REQUIRED)
find_package(SQLite3 REQUIRED)

add_executable(cpp_watcher_example main.cpp)

# websocketpp uses Asio; link pthread on non-Windows targets.
if(NOT WIN32)
  find_package(Threads REQUIRED)
  target_link_libraries(cpp_watcher_example PRIVATE Threads::Threads)
endif()

target_link_libraries(
  cpp_watcher_example
  PRIVATE
    websocketpp::websocketpp
    nlohmann_json::nlohmann_json
    SQLite::SQLite3
)
