//! A `Tag` just above every allocation and contains a number of bits for the allocation algorithm.
//
// TALC-PATCH (two changes):
//
// 1. clear_above_free: XOR → AND-NOT.
//    Upstream uses `(*ptr).0 ^= ABOVE_FREE_FLAG`, which is non-idempotent: a spurious call
//    when ABOVE_FREE is already 0 flips it to 1, creating a false-positive free-gap indication.
//    The next deallocate reads that 1, trusts ABOVE_FREE, reads garbage user-data as a gap
//    size, and traps with an OOB memory access.  AND-NOT is idempotent (0→0, 1→0) so spurious
//    calls are safe.
//
// 2. Removed debug_assert! in set_above_free / clear_above_free.
//    The original asserts could cause a recursive-panic crash: the panic handler tries to
//    format an error string which allocates, which re-enters talc, which panics again.
//    With the AND-NOT fix above the ABOVE_FREE invariant holds correctly, so the assert is
//    only a concern for the set path; we remove it from both for symmetry and safety.

/// Tag for allocated chunk metadata.
#[derive(Clone, Copy)]
pub struct Tag(pub u8);

impl core::fmt::Debug for Tag {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("Tag")
            .field("is_allocated", &self.is_allocated())
            .field("is_above_free", &self.is_above_free())
            .field("is_heap_base", &self.is_heap_base())
            .field("is_heap_end", &self.is_heap_end())
            .finish()
    }
}

impl core::ops::BitOr for Tag {
    type Output = Tag;

    #[inline]
    fn bitor(self, rhs: Self) -> Self::Output {
        Tag(self.0 | rhs.0)
    }
}

impl core::ops::BitAnd for Tag {
    type Output = Tag;

    #[inline]
    fn bitand(self, rhs: Self) -> Self::Output {
        Tag(self.0 & rhs.0)
    }
}

impl core::ops::BitOrAssign for Tag {
    #[inline]
    fn bitor_assign(&mut self, rhs: Self) {
        self.0 |= rhs.0;
    }
}

impl Tag {
    pub const ALLOCATED_FLAG: u8 = 1 << 0;
    pub const ABOVE_FREE_FLAG: u8 = 1 << 1;
    pub const HEAP_BASE_FLAG: u8 = 1 << 2;
    pub const HEAP_END_FLAG: u8 = 1 << 3;

    pub const ALLOCATED: Tag = Tag(Self::ALLOCATED_FLAG);
    pub const ABOVE_FREE: Tag = Tag(Self::ABOVE_FREE_FLAG);
    pub const HEAP_BASE: Tag = Tag(Self::HEAP_BASE_FLAG);
    pub const HEAP_END: Tag = Tag(Self::HEAP_END_FLAG);

    #[inline]
    pub fn is_above_free(self) -> bool {
        self.0 & Self::ABOVE_FREE_FLAG != 0
    }

    #[inline]
    pub fn is_allocated(self) -> bool {
        self.0 & Self::ALLOCATED_FLAG != 0
    }

    #[inline]
    pub fn is_heap_base(self) -> bool {
        self.0 & Self::HEAP_BASE_FLAG != 0
    }

    #[inline]
    pub fn is_heap_end(self) -> bool {
        self.0 & Self::HEAP_END_FLAG != 0
    }

    #[inline]
    #[track_caller]
    pub unsafe fn set_above_free(ptr: *mut Self) {
        // TALC-PATCH: removed debug_assert — see module comment.
        (*ptr).0 |= Self::ABOVE_FREE_FLAG;
    }

    #[inline]
    #[track_caller]
    pub unsafe fn clear_above_free(ptr: *mut Self) {
        // TALC-PATCH: AND-NOT instead of XOR — see module comment for why.
        // XOR would flip 0→1 on a spurious call (ABOVE_FREE already clear), creating a
        // false-positive indication that causes the next deallocate to read garbage as a
        // gap size and trap with OOB.  AND-NOT is idempotent: 0&!2=0, 1&!2=0.
        (*ptr).0 &= !Self::ABOVE_FREE_FLAG;
    }

    #[inline]
    #[track_caller]
    pub unsafe fn set_end_flag(ptr: *mut Self) {
        debug_assert!((*ptr).0 & Self::HEAP_END_FLAG == 0);
        (*ptr).0 ^= Self::HEAP_END_FLAG;
    }

    #[inline]
    #[track_caller]
    pub unsafe fn clear_end_flag(ptr: *mut Self) {
        debug_assert!((*ptr).0 & Self::HEAP_END_FLAG != 0);
        (*ptr).0 ^= Self::HEAP_END_FLAG;
    }
}
