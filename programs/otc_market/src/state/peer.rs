use crate::*;

#[account]
#[derive(InitSpace)]
pub struct Peer {
    pub address: [u8; 32],
    pub bump: u8,
}
impl Peer {
    pub const PEER_SEED: &'static [u8; 4] = b"Peer";
}