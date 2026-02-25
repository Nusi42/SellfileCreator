cmake_minimum_required(VERSION 3.20)
project(sellfile_creator_cpp_watcher LANGUAGES C CXX)

# FetchContent_Populate is still required for websocketpp because we only want
# the downloaded headers and must not execute its legacy CMake project.
if(POLICY CMP0169)
  cmake_policy(SET CMP0169 OLD)
endif()

# Use C++20 for filesystem + chrono conveniences.
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Allow fetching header-only deps when package-manager configs are unavailable.
include(FetchContent)

# Prefer an installed websocketpp package (vcpkg/choco/custom install).
find_package(websocketpp CONFIG QUIET)
if(NOT websocketpp_FOUND)
  message(STATUS "websocketpp package not found; fetching websocketpp 0.8.2")
  FetchContent_Declare(
    websocketpp_src
    URL https://github.com/zaphoyd/websocketpp/archive/refs/tags/0.8.2.tar.gz
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
  )
  FetchContent_GetProperties(websocketpp_src)
  if(NOT websocketpp_src_POPULATED)
    FetchContent_Populate(websocketpp_src)
  endif()

  # websocketpp defaults to Boost.Asio; when no package manager wiring exists,
  # fetch standalone Asio and force that mode.
  FetchContent_Declare(
    asio_src
    URL https://github.com/chriskohlhoff/asio/archive/refs/tags/asio-1-30-2.tar.gz
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
  )
  FetchContent_GetProperties(asio_src)
  if(NOT asio_src_POPULATED)
    FetchContent_Populate(asio_src)
  endif()

  # websocketpp is header-only; expose include directory via imported target.
  if(NOT TARGET websocketpp::websocketpp)
    add_library(websocketpp::websocketpp INTERFACE IMPORTED)
    set_target_properties(
      websocketpp::websocketpp
      PROPERTIES
        INTERFACE_INCLUDE_DIRECTORIES "${websocketpp_src_SOURCE_DIR};${asio_src_SOURCE_DIR}/asio/include"
        INTERFACE_COMPILE_DEFINITIONS "ASIO_STANDALONE"
    )
  endif()
endif()

# Prefer an installed nlohmann_json package; otherwise fetch a known release.
find_package(nlohmann_json CONFIG QUIET)
if(NOT nlohmann_json_FOUND)
  message(STATUS "nlohmann_json package not found; fetching v3.11.3")
  FetchContent_Declare(
    nlohmann_json
    URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
  )
  FetchContent_MakeAvailable(nlohmann_json)
endif()

# Prefer an installed SQLite3 package; otherwise fetch amalgamation sources.
find_package(SQLite3 QUIET)
if(NOT SQLite3_FOUND)
  message(STATUS "SQLite3 package not found; fetching sqlite amalgamation 3.46.1")
  FetchContent_Declare(
    sqlite3_src
    URL https://www.sqlite.org/2024/sqlite-amalgamation-3460100.zip
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
  )
  FetchContent_GetProperties(sqlite3_src)
  if(NOT sqlite3_src_POPULATED)
    FetchContent_Populate(sqlite3_src)
  endif()

  # Build a local static sqlite3 target and expose the standard target name.
  add_library(sqlite3_fallback STATIC "${sqlite3_src_SOURCE_DIR}/sqlite3.c")
  target_include_directories(sqlite3_fallback PUBLIC "${sqlite3_src_SOURCE_DIR}")

  if(NOT TARGET SQLite::SQLite3)
    add_library(SQLite::SQLite3 ALIAS sqlite3_fallback)
  endif()
endif()

add_executable(cpp_watcher_example main.cpp)

# websocketpp uses Asio; link pthread on non-Windows targets.
if(NOT WIN32)
  find_package(Threads REQUIRED)
  target_link_libraries(cpp_watcher_example PRIVATE Threads::Threads)
else()
  # Standalone Asio on Windows requires Winsock.
  target_link_libraries(cpp_watcher_example PRIVATE ws2_32)
endif()

target_link_libraries(
  cpp_watcher_example
  PRIVATE
    websocketpp::websocketpp
    nlohmann_json::nlohmann_json
    SQLite::SQLite3
)
