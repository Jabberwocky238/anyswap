// SPDX-License-Identifier: MIT

use anchor_lang::prelude::*;
use primitive_types::U256;

use crate::error::ErrorCode;

/**
 * @dev Wrappers over Solidity's arithmetic operations with added overflow checks.
 * Adapted from OpenZeppelin's SafeMath library.
 */
pub struct Math;

impl Math {
    // solhint-disable no-inline-assembly

    /**
     * @dev Returns the absolute value of a signed integer.
     */
    pub fn abs(a: i128) -> Result<U256> {
        // Equivalent to:
        // result = a > 0 ? uint256(a) : uint256(-a)
        if a >= 0 {
            Ok(U256::from(a as u128))
        } else {
            let neg_a = -a;
            Ok(U256::from(neg_a as u128))
        }
    }

    /**
     * @dev Returns the addition of two unsigned integers of 256 bits, reverting on overflow.
     */
    pub fn add(a: U256, b: U256) -> Result<U256> {
        let c = a.checked_add(b).ok_or(ErrorCode::MathOverflow)?;
        require!(c >= a, ErrorCode::MathOverflow);
        Ok(c)
    }

    /**
     * @dev Returns the addition of two signed integers, reverting on overflow.
     */
    pub fn add_signed(a: i128, b: i128) -> Result<i128> {
        let c = a.checked_add(b).ok_or(ErrorCode::MathOverflow)?;
        require!(
            (b >= 0 && c >= a) || (b < 0 && c < a),
            ErrorCode::MathOverflow
        );
        Ok(c)
    }

    /**
     * @dev Returns the subtraction of two unsigned integers of 256 bits, reverting on overflow.
     */
    pub fn sub(a: U256, b: U256) -> Result<U256> {
        require!(b <= a, ErrorCode::MathOverflow);
        let c = a.checked_sub(b).ok_or(ErrorCode::MathOverflow)?;
        Ok(c)
    }

    /**
     * @dev Returns the subtraction of two signed integers, reverting on overflow.
     */
    pub fn sub_signed(a: i128, b: i128) -> Result<i128> {
        let c = a.checked_sub(b).ok_or(ErrorCode::MathOverflow)?;
        require!(
            (b >= 0 && c <= a) || (b < 0 && c > a),
            ErrorCode::MathOverflow
        );
        Ok(c)
    }

    /**
     * @dev Returns the largest of two numbers of 256 bits.
     */
    pub fn max(a: U256, b: U256) -> Result<U256> {
        // Equivalent to:
        // result = (a < b) ? b : a;
        Ok(if a < b { b } else { a })
    }

    /**
     * @dev Returns the smallest of two numbers of 256 bits.
     */
    pub fn min(a: U256, b: U256) -> Result<U256> {
        // Equivalent to `result = (a < b) ? a : b`
        Ok(if a < b { a } else { b })
    }

    pub fn mul(a: U256, b: U256) -> Result<U256> {
        let c = a.checked_mul(b).ok_or(ErrorCode::MathOverflow)?;
        require!(a.is_zero() || c.checked_div(a).map(|d| d == b).unwrap_or(false), ErrorCode::MathOverflow);
        Ok(c)
    }

    pub fn div(a: U256, b: U256, round_up: bool) -> Result<U256> {
        if round_up {
            Self::div_up(a, b)
        } else {
            Self::div_down(a, b)
        }
    }

    pub fn div_down(a: U256, b: U256) -> Result<U256> {
        require!(!b.is_zero(), ErrorCode::MathOverflow);
        Ok(a / b)
    }

    pub fn div_up(a: U256, b: U256) -> Result<U256> {
        require!(!b.is_zero(), ErrorCode::MathOverflow);

        // Equivalent to:
        // result = a == 0 ? 0 : 1 + (a - 1) / b;
        if a.is_zero() {
            Ok(U256::zero())
        } else {
            let a_minus_one = a.checked_sub(U256::one()).ok_or(ErrorCode::MathOverflow)?;
            let div_result = a_minus_one / b;
            Ok(div_result.checked_add(U256::one()).ok_or(ErrorCode::MathOverflow)?)
        }
    }
}

