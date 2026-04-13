//! A bunch of utility functions for working with chunks.
//!
//!

use core::{mem::size_of, ptr::NonNull};

use crate::{base::tag::Tag, node::Node, ptr_utils};

/// Returns whether the two pointers are greater than `CHUNK_UNIT` apart.
#[inline]
pub(crate) fn is_chunk_size(base: *mut u8, end: *mut u8) -> bool {
    end as usize - base as usize >= CHUNK_UNIT
}

#[inline]
pub(crate) const fn required_chunk_size(size: usize) -> usize {
    (size + size_of::<Tag>() + (CHUNK_UNIT - 1)) & !(CHUNK_UNIT - 1)
}

#[inline]
pub(crate) unsafe fn alloc_to_end(base: *mut u8, size: usize) -> *mut u8 {
    base.wrapping_add(required_chunk_size(size))
}

/// The minimum size and alignment that Talc will use for chunks.
///
/// It may situationally take on other values in the future.
///
/// TALC-PATCH: was `size_of::<usize>() * 4` (= 16 on wasm32).  Increased to
/// `size_of::<usize>() * 8` (= 32 on wasm32) for two reasons:
///
/// 1. **Power-of-2 requirement**: `align_up_by` / `align_down_by` / `required_chunk_size`
///    all use bitmask arithmetic (`& !(CHUNK_UNIT - 1)`) which only works correctly when
///    CHUNK_UNIT is a power of 2.  The minimum needed for the new end-structure is 24 bytes,
///    but 24 is not a power of 2; the next valid value is 32.
///
/// 2. **Non-overlapping fields**: with the new end-structure, `gap_end_to_size_and_flag(end)`
///    is at `end-8`.  For a minimum-size gap of 32 bytes:
///    - `gap_base_to_size(base)` = `base+12`
///    - `gap_end_to_size_and_flag(base+32)` = `base+24`
///    These are distinct — no trivial self-match, no overlap with forward-structure fields.
pub const CHUNK_UNIT: usize = size_of::<usize>() * 8;

// TALC-PATCH (architectural layout): Separate the tag byte from the end-size word.
//
// Upstream layout (CHUNK_UNIT=16 on wasm32):
//
//   [base, base+16)    forward structure   (Node at +0, bin at +8, low_size at +12)
//   [end-4, end)       end_size word       (4 bytes on wasm32)
//                      end[-1]  also serves as tag_byte via end_to_tag(end)
//
//   BUG: for gaps ≥16 MiB, bit 0 (ALLOCATED_FLAG) of the end-size MSB (end[-1]) is set
//   from the size value itself.  `is_allocated()` reads that byte and returns `true` on a
//   FREE gap, causing deallocate to call set_above_free on what it thinks is an alloc tag —
//   but is actually the end-size MSB — silently corrupting the size.
//
// Fixed layout (CHUNK_UNIT=32 on wasm32):
//
//   [base, base+16)    forward structure   (Node at +0, bin at +8, low_size at +12)
//   [end-8, end-4)     end_size word       (4 bytes on wasm32, now separate from tag)
//   [end-4, end-1)     unused padding      (3 bytes on wasm32)
//   [end-1, end)       tag byte            (always Tag(0) for free gaps; written by register_gap)
//
//   With this layout `is_allocated()` reads end[-1], which is EITHER:
//     • Tag(0)  — the dedicated free-gap marker written by register_gap
//     • Tag(ALLOCATED | ...)  — an allocation tag written by try_allocate / try_grow_in_place
//   It NEVER reads an end-size MSB again.  Zero false positives for ALL gap sizes 0–4 GiB.
//
//   set_above_free writes to end[-1].  With the old layout that also corrupted end[-1] which
//   was part of end-size.  With the new layout end-size is at end[-8..end-4] — a completely
//   different address — so set_above_free can never corrupt it.
const GAP_NODE_OFFSET: usize = 0;
const GAP_BIN_OFFSET: usize = size_of::<usize>() * 2;
const GAP_LOW_SIZE_OFFSET: usize = size_of::<usize>() * 3;
// TALC-PATCH: was size_of::<usize>() (= 4 on wasm32); now size_of::<usize>() * 2 (= 8 on wasm32).
// Moving end-size away from the last byte separates it from the tag byte.
const GAP_HIGH_SIZE_OFFSET: usize = size_of::<usize>() * 2;

pub const END_FLAG: usize = Tag::HEAP_END_FLAG as usize;

// WASM perf tanks if these #[inline]'s are not present
#[inline]
pub(crate) unsafe fn gap_base_to_node(base: *mut u8) -> *mut Node {
    base.add(GAP_NODE_OFFSET).cast()
}
#[inline]
pub(crate) unsafe fn gap_base_to_bin(base: *mut u8) -> *mut u32 {
    base.add(GAP_BIN_OFFSET).cast()
}
#[inline]
pub(crate) unsafe fn gap_base_to_size(base: *mut u8) -> *mut usize {
    base.add(GAP_LOW_SIZE_OFFSET).cast()
}
#[inline]
pub(crate) unsafe fn gap_end_to_size_and_flag(end: *mut u8) -> *mut usize {
    end.sub(GAP_HIGH_SIZE_OFFSET).cast()
}
#[inline]
pub(crate) unsafe fn gap_node_to_base(node: NonNull<Node>) -> *mut u8 {
    node.as_ptr().cast::<u8>().sub(GAP_NODE_OFFSET).cast()
}
#[inline]
pub(crate) unsafe fn gap_node_to_size(node: NonNull<Node>) -> *mut usize {
    node.as_ptr().cast::<u8>().sub(GAP_NODE_OFFSET).add(GAP_LOW_SIZE_OFFSET).cast()
}
#[inline]
pub(crate) unsafe fn end_to_tag(end: *mut u8) -> *mut Tag {
    end.sub(size_of::<Tag>()).cast()
}

/// Aligns `ptr` up by `CHUNK_UNIT`.
#[inline]
pub(crate) fn align_up(ptr: *mut u8) -> *mut u8 {
    ptr_utils::align_up_by(ptr, CHUNK_UNIT)
}
/// Aligns `ptr` down by `CHUNK_UNIT`.
#[inline]
pub(crate) fn align_down(ptr: *mut u8) -> *mut u8 {
    ptr_utils::align_down_by(ptr, CHUNK_UNIT)
}
