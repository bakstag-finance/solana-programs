use crate::*;
use anchor_spl::token_interface::{
    transfer_checked,
    Mint,
    TokenAccount,
    TokenInterface,
    TransferChecked,
};
use oapp::endpoint::{ instructions::RegisterOAppParams, ID as ENDPOINT_ID };

#[account]
#[derive(InitSpace)]
pub struct OtcConfig {
    pub endpoint_program: Pubkey,
    pub bump: u8,

    // pub eid: u32,
    pub admin: Pubkey,
    pub treasury: Pubkey,
}

impl OtcConfig {
    pub const EID: u32 = 40168;
    pub const OTC_SEED: &'static [u8; 3] = b"Otc";
    pub const SHARED_DECIMALS: u8 = 6;
    pub const FEE: u8 = 100;

    pub const ERROR_MSG: &'static str = "An account required by the instruction is missing";

    pub fn init(
        &mut self,
        endpoint_program: Option<Pubkey>,
        admin: Pubkey,
        accounts: &[AccountInfo],
        oapp_signer: Pubkey
    ) -> Result<()> {
        self.admin = admin;
        self.endpoint_program = if let Some(endpoint_program) = endpoint_program {
            endpoint_program
        } else {
            ENDPOINT_ID
        };

        //self.eid = 40168;

        // register oapp
        oapp::endpoint_cpi::register_oapp(
            self.endpoint_program,
            oapp_signer,
            accounts,
            &[Self::OTC_SEED, &admin.as_ref(), &[self.bump]],
            RegisterOAppParams {
                delegate: self.admin,
            }
        )
    }

    pub fn ld2sd(amount_ld: u64, decimal_conversion_rate: u64) -> u64 {
        amount_ld / decimal_conversion_rate
    }

    pub fn sd2ld(amount_sd: u64, decimal_conversion_rate: u64) -> u64 {
        amount_sd * decimal_conversion_rate
    }

    pub fn remove_dust(amount_ld: u64, decimal_conversion_rate: u64) -> (u64, u64) {
        let amount_sd = Self::ld2sd(amount_ld, decimal_conversion_rate);
        let amount_ld = Self::sd2ld(amount_sd, decimal_conversion_rate);

        (amount_sd, amount_ld)
    }

    pub fn get_token_address(token_mint: Option<&InterfaceAccount<Mint>>) -> [u8; 32] {
        if let Some(mint) = token_mint { mint.key().to_bytes() } else { <[u8; 32]>::default() }
    }

    pub fn get_decimal_conversion_rate(token_mint: Option<&InterfaceAccount<Mint>>) -> u64 {
        if let Some(token_mint) = token_mint {
            (10u64).pow((token_mint.decimals - Self::SHARED_DECIMALS) as u32)
        } else {
            (10u64).pow((9u8 - Self::SHARED_DECIMALS) as u32)
        }
    }

    pub fn to_dst_amount(
        src_amount_sd: u64,
        exchange_rate_sd: u64,
        dst_token_mint: Option<&InterfaceAccount<Mint>>
    ) -> AcceptOfferReceipt {
        let dst_decimal_conversion_rate = Self::get_decimal_conversion_rate(dst_token_mint);

        let dst_amount_ld =
            (src_amount_sd * exchange_rate_sd * dst_decimal_conversion_rate) /
            (10u64).pow(Self::SHARED_DECIMALS as u32); // TODO: check for overflow

        let fee_ld = dst_amount_ld / (Self::FEE as u64);

        AcceptOfferReceipt {
            dst_amount_ld,
            fee_ld,
        }
    }

    pub fn transfer<'info>(
        from: &AccountInfo<'info>,
        amount: u64,

        // sol
        to: Option<&AccountInfo<'info>>,

        // spl token
        token_program: Option<&Interface<'info, TokenInterface>>,
        from_ata: Option<&InterfaceAccount<'info, TokenAccount>>,
        token_mint: Option<&InterfaceAccount<'info, Mint>>,
        to_ata: Option<&InterfaceAccount<'info, TokenAccount>>,

        // signed
        seeds: Option<&[&[&[u8]]]>
    ) -> Result<()> {
        let is_native = token_mint.is_none(); // decide if native

        if is_native {
            // transfer sol tokens
            let to_sol = to.expect(Self::ERROR_MSG);

            // TODO: refactor
            if seeds.is_some() {
                **from.try_borrow_mut_lamports()? -= amount;
                **to_sol.try_borrow_mut_lamports()? += amount;
            } else {
                solana_program::program::invoke(
                    &solana_program::system_instruction::transfer(
                        &from.key(),
                        &to_sol.key(),
                        amount
                    ),
                    &[from.to_account_info(), to_sol.to_account_info()]
                )?;
            }

            Ok(())
        } else {
            // transfer spl tokens
            let token_mint = token_mint.expect(Self::ERROR_MSG);

            transfer_checked(
                CpiContext::new(
                    token_program.expect(Self::ERROR_MSG).to_account_info(),
                    TransferChecked {
                        from: from_ata.expect(Self::ERROR_MSG).to_account_info(),
                        mint: token_mint.to_account_info(),
                        to: to_ata.expect(Self::ERROR_MSG).to_account_info(),
                        authority: from.to_account_info(),
                    }
                ).with_signer(seeds.unwrap_or_default()),
                amount,
                token_mint.decimals
            )?;

            Ok(())
        }
    }
}
