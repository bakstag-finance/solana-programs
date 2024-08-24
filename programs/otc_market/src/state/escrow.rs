use crate::*;

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub bump: u8,
}

impl Escrow {
    pub const ESCROW_SEED: &'static [u8; 6] = b"Escrow";
}
