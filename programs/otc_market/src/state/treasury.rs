use crate::*;

#[account]
#[derive(InitSpace)]
pub struct Treasury {
    pub bump: u8,
}

impl Treasury {
    pub const TREASURY_SEED: &'static [u8; 8] = b"Treasury";
}
