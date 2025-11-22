// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

use anchor_lang::prelude::*;
use primitive_types::U256;

use crate::error::ErrorCode;
use super::logexpmath::LogExpMath;

/* solhint-disable private-vars-leading-underscore */

pub struct FixedPoint;

impl FixedPoint {
    // solhint-disable no-inline-assembly

    pub const ONE: U256 = U256([1000000000000000000, 0, 0, 0]); // 18 decimal places
    pub const TWO: U256 = U256([2000000000000000000, 0, 0, 0]);
    pub const FOUR: U256 = U256([4000000000000000000, 0, 0, 0]);
    pub const MAX_POW_RELATIVE_ERROR: U256 = U256([10000, 0, 0, 0]); // 10^(-14)

    // Minimum base for the power function when the exponent is 'free' (larger than ONE).
    pub const MIN_POW_BASE_FREE_EXPONENT: U256 = U256([700000000000000000, 0, 0, 0]);

    pub fn add(a: U256, b: U256) -> Result<U256> {
        // Fixed Point addition is the same as regular checked addition

        let c = a.checked_add(b).ok_or(ErrorCode::MathOverflow)?;
        require!(c >= a, ErrorCode::MathOverflow);
        Ok(c)
    }

    pub fn sub(a: U256, b: U256) -> Result<U256> {
        // Fixed Point subtraction is the same as regular checked subtraction

        require!(b <= a, ErrorCode::MathOverflow);
        let c = a.checked_sub(b).ok_or(ErrorCode::MathOverflow)?;
        Ok(c)
    }

    pub fn mul_down(a: U256, b: U256) -> Result<U256> {
        let product = a.checked_mul(b).ok_or(ErrorCode::MathOverflow)?;
        require!(a.is_zero() || product.checked_div(a).map(|d| d == b).unwrap_or(false), ErrorCode::MathOverflow);

        Ok(product / Self::ONE)
    }

    pub fn mul_up(a: U256, b: U256) -> Result<U256> {
        let product = a.checked_mul(b).ok_or(ErrorCode::MathOverflow)?;
        require!(a.is_zero() || product.checked_div(a).map(|d| d == b).unwrap_or(false), ErrorCode::MathOverflow);

        // The traditional divUp formula is:
        // divUp(x, y) := (x + y - 1) / y
        // To avoid intermediate overflow in the addition, we distribute the division and get:
        // divUp(x, y) := (x - 1) / y + 1
        // Note that this requires x != 0, if x == 0 then the result is zero
        //
        // Equivalent to:
        // result = product == 0 ? 0 : ((product - 1) / FixedPoint.ONE) + 1;
        if product.is_zero() {
            Ok(U256::zero())
        } else {
            let product_minus_one = product.checked_sub(U256::one()).ok_or(ErrorCode::MathOverflow)?;
            let div_result = product_minus_one / Self::ONE;
            Ok(div_result.checked_add(U256::one()).ok_or(ErrorCode::MathOverflow)?)
        }
    }

    pub fn div_down(a: U256, b: U256) -> Result<U256> {
        require!(!b.is_zero(), ErrorCode::MathOverflow);

        let a_inflated = a.checked_mul(Self::ONE).ok_or(ErrorCode::MathOverflow)?;
        require!(a.is_zero() || a_inflated.checked_div(a).map(|d| d == Self::ONE).unwrap_or(false), ErrorCode::MathOverflow); // mul overflow

        Ok(a_inflated / b)
    }

    pub fn div_up(a: U256, b: U256) -> Result<U256> {
        require!(!b.is_zero(), ErrorCode::MathOverflow);

        let a_inflated = a.checked_mul(Self::ONE).ok_or(ErrorCode::MathOverflow)?;
        require!(a.is_zero() || a_inflated.checked_div(a).map(|d| d == Self::ONE).unwrap_or(false), ErrorCode::MathOverflow); // mul overflow

        // The traditional divUp formula is:
        // divUp(x, y) := (x + y - 1) / y
        // To avoid intermediate overflow in the addition, we distribute the division and get:
        // divUp(x, y) := (x - 1) / y + 1
        // Note that this requires x != 0, if x == 0 then the result is zero
        //
        // Equivalent to:
        // result = a == 0 ? 0 : (a * FixedPoint.ONE - 1) / b + 1;
        if a_inflated.is_zero() {
            Ok(U256::zero())
        } else {
            let a_inflated_minus_one = a_inflated.checked_sub(U256::one()).ok_or(ErrorCode::MathOverflow)?;
            let div_result = a_inflated_minus_one / b;
            Ok(div_result.checked_add(U256::one()).ok_or(ErrorCode::MathOverflow)?)
        }
    }

    /**
     * @dev Returns x^y, assuming both are fixed point numbers, rounding down. The result is guaranteed to not be above
     * the true value (that is, the error function expected - actual is always positive).
     */
    pub fn pow_down(x: U256, y: U256) -> Result<U256> {
        // Optimize for when y equals 1.0, 2.0 or 4.0, as those are very simple to implement and occur often in 50/50
        // and 80/20 Weighted Pools
        if y == Self::ONE {
            Ok(x)
        } else if y == Self::TWO {
            Self::mul_down(x, x)
        } else if y == Self::FOUR {
            let square = Self::mul_down(x, x)?;
            Self::mul_down(square, square)
        } else {
            let raw = LogExpMath::pow(x, y)?;
            let max_error = Self::add(Self::mul_up(raw, Self::MAX_POW_RELATIVE_ERROR)?, U256::one())?;

            if raw < max_error {
                Ok(U256::zero())
            } else {
                Self::sub(raw, max_error)
            }
        }
    }

    /**
     * @dev Returns x^y, assuming both are fixed point numbers, rounding up. The result is guaranteed to not be below
     * the true value (that is, the error function expected - actual is always negative).
     */
    pub fn pow_up(x: U256, y: U256) -> Result<U256> {
        // Optimize for when y equals 1.0, 2.0 or 4.0, as those are very simple to implement and occur often in 50/50
        // and 80/20 Weighted Pools
        if y == Self::ONE {
            Ok(x)
        } else if y == Self::TWO {
            Self::mul_up(x, x)
        } else if y == Self::FOUR {
            let square = Self::mul_up(x, x)?;
            Self::mul_up(square, square)
        } else {
            let raw = LogExpMath::pow(x, y)?;
            let max_error = Self::add(Self::mul_up(raw, Self::MAX_POW_RELATIVE_ERROR)?, U256::one())?;

            Self::add(raw, max_error)
        }
    }

    /**
     * @dev Returns the complement of a value (1 - x), capped to 0 if x is larger than 1.
     *
     * Useful when computing the complement for values with some level of relative error, as it strips this error and
     * prevents intermediate negative values.
     */
    pub fn complement(x: U256) -> Result<U256> {
        // Equivalent to:
        // result = (x < ONE) ? (ONE - x) : 0;
        if x < Self::ONE {
            Self::sub(Self::ONE, x)
        } else {
            Ok(U256::zero())
        }
    }
}

