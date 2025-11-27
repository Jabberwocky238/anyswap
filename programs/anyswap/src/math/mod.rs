pub mod math;
pub mod fixedpoint;
pub mod logexpmath;
// pub mod logexpmath2;
pub mod i256;

// 运行测试: cargo test --manifest-path programs/anyswap/Cargo.toml test_three_token_swap --lib
#[cfg(test)]
mod tests_three_token_swap {
    use super::fixedpoint::FixedPoint;
    use primitive_types::U256;

    /**
     * @dev 测试三 token swap，2进1出，使用权重恒定乘积公式
     * 
     * 公式: a^wa * b^wb * c^wc = K (恒定乘积)
     * 
     * 对于 2进1出 的交换：
     * 交换前: a^wa * b^wb * c^wc = K
     * 交换后: (a + amount_in_a)^wa * (b + amount_in_b)^wb * (c - amount_out_c)^wc = K
     * 
     * 因此：
     * (c - amount_out_c)^wc = (a^wa * b^wb * c^wc) / ((a + amount_in_a)^wa * (b + amount_in_b)^wb)
     * 
     * amount_out_c = c - ((a^wa * b^wb * c^wc) / ((a + amount_in_a)^wa * (b + amount_in_b)^wb))^(1/wc)
     */
    #[test]
    fn test_three_token_swap_2in_1out() {
        use super::logexpmath::{LogExpMath, ONE_18};
        use super::i256::I256;
        
        // 设置三个 token 的初始储备和权重
        // 使用 18 位小数的固定点数
        // 一百万 token = 1_000_000 * 1e18 = 1_000_000_000_000_000_000_000
        let vault_a = U256::from(1_000_000u128) * U256::from(1_000_000_000_000_000_000u64); // 1,000,000 tokens (18 decimals)
        let vault_b = U256::from(1_000_000u128) * U256::from(1_000_000_000_000_000_000u64); // 1,000,000 tokens (18 decimals)
        let vault_c = U256::from(1_000_000u128) * U256::from(1_000_000_000_000_000_000u64); // 1,000,000 tokens (18 decimals)
        
        // 权重使用 18 位小数（与 FixedPoint::ONE 一致）
        // 权重设置为 20, 20, 80（18 位小数：20e18, 20e18, 80e18）
        let weight_a = U256::from(20u128) * U256::from(1_000_000_000_000_000_000u64); // 20.0 (18 decimals)
        let weight_b = U256::from(20u128) * U256::from(1_000_000_000_000_000_000u64); // 20.0 (18 decimals)
        let weight_c = U256::from(80u128) * U256::from(1_000_000_000_000_000_000u64); // 80.0 (18 decimals)
        
        println!("交换前状态:");
        println!("  vault_a = {} (1,000,000 tokens)", vault_a);
        println!("  vault_b = {} (1,000,000 tokens)", vault_b);
        println!("  vault_c = {} (1,000,000 tokens)", vault_c);
        println!("  weight_a = {}", weight_a);
        println!("  weight_b = {}", weight_b);
        println!("  weight_c = {}", weight_c);
        
        // 用户输入：token A 和 token B
        // 输入 100,000 tokens (10% of vault)
        let amount_in_a = U256::from(100_000u128) * U256::from(1_000_000_000_000_000_000u64); // 100,000 tokens (18 decimals)
        let amount_in_b = U256::from(100_000u128) * U256::from(1_000_000_000_000_000_000u64); // 100,000 tokens (18 decimals)
        
        println!("\n交换输入:");
        println!("  amount_in_a = {}", amount_in_a);
        println!("  amount_in_b = {}", amount_in_b);
        
        // 使用增量计算：权重对数和恒定公式
        // wa * ln(a) + wb * ln(b) + wc * ln(c) = constant
        // 交换后：wa * ln(a + amount_in_a) + wb * ln(b + amount_in_b) + wc * ln(c - amount_out_c) = constant
        
        // 步骤1: 计算 wa * ln(a) 和 wb * ln(b)
        let vault_a_i256 = I256::try_from(vault_a).unwrap();
        let vault_b_i256 = I256::try_from(vault_b).unwrap();
        let vault_c_i256 = I256::try_from(vault_c).unwrap();
        
        let ln_a = LogExpMath::ln(vault_a_i256).unwrap();
        let ln_b = LogExpMath::ln(vault_b_i256).unwrap();
        let ln_c = LogExpMath::ln(vault_c_i256).unwrap();
        
        // 计算 wa * ln(a) 和 wb * ln(b)
        // ln 返回的是 18 位小数的 I256，weight 也是 18 位小数的 U256
        // 所以 wa * ln(a) 需要先转换为 I256，然后相乘，再除以 ONE_18 得到 18 位小数结果
        let weight_a_i256 = I256::try_from(weight_a).unwrap();
        let weight_b_i256 = I256::try_from(weight_b).unwrap();
        let weight_c_i256 = I256::try_from(weight_c).unwrap();
        
        // 使用 * 操作符，溢出会 panic
        let wa_ln_a = (weight_a_i256 * ln_a) / ONE_18;
        let wb_ln_b = (weight_b_i256 * ln_b) / ONE_18;
        let wc_ln_c = (weight_c_i256 * ln_c) / ONE_18;
        
        println!("\n步骤1: 计算权重对数");
        println!("  ln(a) = {:?}", ln_a);
        println!("  ln(b) = {:?}", ln_b);
        println!("  ln(c) = {:?}", ln_c);
        println!("  wa * ln(a) = {:?}", wa_ln_a);
        println!("  wb * ln(b) = {:?}", wb_ln_b);
        println!("  wc * ln(c) = {:?}", wc_ln_c);
        
        // 步骤2: 计算 wa * ln(a + amount_in_a) 和 wb * ln(b + amount_in_b)
        let vault_a_after = vault_a + amount_in_a;
        let vault_b_after = vault_b + amount_in_b;
        
        let vault_a_after_i256 = I256::try_from(vault_a_after).unwrap();
        let vault_b_after_i256 = I256::try_from(vault_b_after).unwrap();
        
        let ln_a_after = LogExpMath::ln(vault_a_after_i256).unwrap();
        let ln_b_after = LogExpMath::ln(vault_b_after_i256).unwrap();
        
        let wa_ln_a_after = (weight_a_i256 * ln_a_after) / ONE_18;
        let wb_ln_b_after = (weight_b_i256 * ln_b_after) / ONE_18;
        
        println!("\n步骤2: 计算交换后的权重对数");
        println!("  vault_a_after = {}", vault_a_after);
        println!("  vault_b_after = {}", vault_b_after);
        println!("  ln(a_after) = {:?}", ln_a_after);
        println!("  ln(b_after) = {:?}", ln_b_after);
        println!("  wa * ln(a_after) = {:?}", wa_ln_a_after);
        println!("  wb * ln(b_after) = {:?}", wb_ln_b_after);
        
        // 步骤3: 计算增量
        // 增量 = wa * [ln(a) - ln(a + amount_in_a)] + wb * [ln(b) - ln(b + amount_in_b)]
        // 注意：ln(a_after) > ln(a)，所以 wa_ln_a_after > wa_ln_a
        // 因此 delta_a = wa_ln_a - wa_ln_a_after 是负数
        // 但是我们需要的是正数增量，所以应该用 wa_ln_a_after - wa_ln_a
        // 实际上，根据公式：wc * ln(c_after) = wc * ln(c) + delta_total
        // 其中 delta_total = wa * [ln(a_after) - ln(a)] + wb * [ln(b_after) - ln(b)]
        let delta_a = wa_ln_a_after - wa_ln_a;  // 正数，因为 a_after > a
        let delta_b = wb_ln_b_after - wb_ln_b;  // 正数，因为 b_after > b
        let delta_total = delta_a + delta_b;
        
        println!("\n步骤3: 计算增量");
        println!("  delta_a = wa * [ln(a_after) - ln(a)] = {:?}", delta_a);
        println!("  delta_b = wb * [ln(b_after) - ln(b)] = {:?}", delta_b);
        println!("  delta_total = {:?}", delta_total);
        
        // 步骤4: 计算 wc * ln(c - amount_out_c) = wc * ln(c) + delta_total
        // 因为 c 减少了，所以 ln(c_after) < ln(c)，因此 wc_ln_c_after < wc_ln_c
        // 但是根据恒定乘积公式，我们需要：wc * ln(c_after) = wc * ln(c) + delta_total
        // 这看起来不对...让我重新思考
        // 实际上，根据恒定乘积：wa*ln(a) + wb*ln(b) + wc*ln(c) = constant
        // 交换后：wa*ln(a_after) + wb*ln(b_after) + wc*ln(c_after) = constant
        // 所以：wc*ln(c_after) = constant - wa*ln(a_after) - wb*ln(b_after)
        //      = [wa*ln(a) + wb*ln(b) + wc*ln(c)] - wa*ln(a_after) - wb*ln(b_after)
        //      = wc*ln(c) + wa*[ln(a) - ln(a_after)] + wb*[ln(b) - ln(b_after)]
        //      = wc*ln(c) - [wa*[ln(a_after) - ln(a)] + wb*[ln(b_after) - ln(b)]]
        //      = wc*ln(c) - delta_total
        let wc_ln_c_after = wc_ln_c - delta_total;
        
        println!("\n步骤4: 计算交换后的 wc * ln(c_after)");
        println!("  wc * ln(c_after) = wc * ln(c) - delta_total = {:?}", wc_ln_c_after);
        
        // 步骤5: 计算 ln(c - amount_out_c) = [wc * ln(c - amount_out_c)] / wc
        // 注意：wc_ln_c_after 已经是 18 位小数的 I256，所以需要先乘以 ONE_18 再除以 weight_c
        // 但是为了避免溢出，我们可以先除以 weight_c，再乘以 ONE_18
        // 实际上：ln_c_after = (wc_ln_c_after / weight_c_i256) * ONE_18
        // 但这样会有精度损失，所以还是用原来的方式，但需要检查溢出
        let ln_c_after = (wc_ln_c_after * ONE_18) / weight_c_i256;
        
        println!("\n步骤5: 计算 ln(c_after)");
        println!("  ln(c_after) = [wc * ln(c_after)] / wc = {:?}", ln_c_after);
        
        // 步骤6: 计算 c - amount_out_c = exp(ln(c_after))
        let vault_c_after_i256 = LogExpMath::exp(ln_c_after).unwrap();
        let vault_c_after = vault_c_after_i256.to_u256().unwrap();
        let amount_out_c = vault_c - vault_c_after;
        
        println!("\n步骤6: 计算输出数量");
        println!("  c_after = exp(ln(c_after)) = {}", vault_c_after);
        println!("  amount_out_c = c - c_after = {}", amount_out_c);
        
        // Python 计算的预期结果（权重 20, 20, 80）:
        // amount_out_c = 46,537.410754 tokens
        // vault_c_after = 953,462.589246 tokens
        // 转换为 18 位小数：46,537.410754 * 1e18
        // 注意：Python 使用浮点数，所以我们需要将结果转换为整数进行比较
        let expected_amount_out_c_tokens = 46_537.410754;
        let expected_vault_c_after_tokens = 953_462.589246;
        
        // 将 Rust 结果转换为 token 单位（除以 1e18）
        let amount_out_c_tokens = amount_out_c.as_u128() as f64 / 1e18;
        let vault_c_after_tokens = vault_c_after.as_u128() as f64 / 1e18;
        
        println!("\n与 Python 计算结果比较:");
        println!("  Python 预期 amount_out_c = {:.6} tokens", expected_amount_out_c_tokens);
        println!("  Rust 计算 amount_out_c = {:.6} tokens", amount_out_c_tokens);
        println!("  Python 预期 vault_c_after = {:.6} tokens", expected_vault_c_after_tokens);
        println!("  Rust 计算 vault_c_after = {:.6} tokens", vault_c_after_tokens);
        
        // 计算误差（允许 0.1% 的误差）
        let amount_out_diff = (amount_out_c_tokens - expected_amount_out_c_tokens).abs();
        let vault_c_after_diff = (vault_c_after_tokens - expected_vault_c_after_tokens).abs();
        let max_diff_tokens = expected_amount_out_c_tokens * 0.001; // 0.1% 误差容忍度
        
        println!("  amount_out_c 误差: {:.6} tokens (最大允许: {:.6} tokens)", amount_out_diff, max_diff_tokens);
        println!("  vault_c_after 误差: {:.6} tokens", vault_c_after_diff);
        
        if amount_out_diff > max_diff_tokens {
            panic!("amount_out_c 与 Python 计算结果差异过大: {:.6} tokens > {:.6} tokens", amount_out_diff, max_diff_tokens);
        }
        if vault_c_after_diff > max_diff_tokens {
            panic!("vault_c_after 与 Python 计算结果差异过大: {:.6} tokens > {:.6} tokens", vault_c_after_diff, max_diff_tokens);
        }
        
        // 验证输出数量合理
        assert!(amount_out_c > U256::zero(), "输出数量应该大于0");
        assert!(vault_c_after <= vault_c, "交换后的储备不应该超过原始储备");
        
        // 验证交换后的恒定乘积（使用对数形式验证）
        let ln_c_after_check = LogExpMath::ln(vault_c_after_i256).unwrap();
        let wc_ln_c_after_check = (weight_c_i256 * ln_c_after_check) / ONE_18;
        
        let constant_before = wa_ln_a + wb_ln_b + wc_ln_c;
        let constant_after = wa_ln_a_after + wb_ln_b_after + wc_ln_c_after_check;
        
        println!("\n验证:");
        println!("  交换前 constant = wa*ln(a) + wb*ln(b) + wc*ln(c) = {:?}", constant_before);
        println!("  交换后 constant = wa*ln(a_after) + wb*ln(b_after) + wc*ln(c_after) = {:?}", constant_after);
        
        // 允许一定的舍入误差
        let delta_constant = constant_before - constant_after;
        let max_error = I256::from(1000000000000000i128); // 0.001 (18 decimals) 的误差容忍度
        
        println!("  差值: {:?}", delta_constant);
        println!("  最大允许误差: {:?}", max_error);
        
        assert!(
            delta_constant <= max_error && delta_constant >= -max_error,
            "恒定对数和应该在允许误差范围内"
        );
        
        println!("\n✅ 三 token swap (2进1出) 测试通过！");
    }
    
    /**
     * @dev 测试三 token swap，使用相同的权重（简化情况）
     */
    #[test]
    fn test_three_token_swap_equal_weights() {
        // 设置三个 token，权重相同（都是 1.0）
        // 一百万 token = 1_000_000 * 1e18 = 1_000_000_000_000_000_000_000
        let vault_a = U256::from(1_000_000u128) * U256::from(1_000_000_000_000_000_000u64); // 1,000,000 tokens
        let vault_b = U256::from(1_000_000u128) * U256::from(1_000_000_000_000_000_000u64); // 1,000,000 tokens
        let vault_c = U256::from(1_000_000u128) * U256::from(1_000_000_000_000_000_000u64); // 1,000,000 tokens
        
        let _weight = FixedPoint::ONE; // 所有权重都是 1.0
        
        // 计算交换前的恒定乘积 K = a * b * c
        let invariant_before = FixedPoint::mul_down(
            FixedPoint::mul_down(vault_a, vault_b).unwrap(),
            vault_c
        ).unwrap();
        
        // 用户输入相同数量的 token A 和 token B
        // 输入 100,000 tokens (10% of vault)
        let amount_in_a = U256::from(100_000u128) * U256::from(1_000_000_000_000_000_000u64); // 100,000 tokens
        let amount_in_b = U256::from(100_000u128) * U256::from(1_000_000_000_000_000_000u64); // 100,000 tokens
        
        let vault_a_after = vault_a + amount_in_a;
        let vault_b_after = vault_b + amount_in_b;
        
        // 当权重都是 1.0 时，公式简化为：
        // (a + amount_in_a) * (b + amount_in_b) * (c - amount_out_c) = a * b * c
        // 因此：c - amount_out_c = (a * b * c) / ((a + amount_in_a) * (b + amount_in_b))
        let product_ab_after = FixedPoint::mul_down(vault_a_after, vault_b_after).unwrap();
        let vault_c_after = FixedPoint::div_down(invariant_before, product_ab_after).unwrap();
        let amount_out_c = vault_c - vault_c_after;
        
        // 验证交换后的恒定乘积
        let invariant_after = FixedPoint::mul_down(
            FixedPoint::mul_down(vault_a_after, vault_b_after).unwrap(),
            vault_c_after
        ).unwrap();
        
        let delta = invariant_before - invariant_after;
        let max_error = FixedPoint::mul_down(
            invariant_before,
            U256::from(10000u64)
        ).unwrap();
        
        assert!(delta <= max_error, "恒定乘积应该在允许误差范围内");
        
        println!("✅ 相同权重测试通过！");
        println!("  输入: {} tokenA + {} tokenB", amount_in_a, amount_in_b);
        println!("  输出: {} tokenC", amount_out_c);
        println!("  K 变化: {} -> {} (差值: {})", invariant_before, invariant_after, delta);
    }

    /**
     * @dev 测试大规模三 token swap，验证系统可以处理更大的数值
     */
    #[test]
    fn test_three_token_swap_large_scale() {
        use super::logexpmath::{LogExpMath, ONE_18};
        use super::i256::I256;
        
        // 设置三个 token 的初始储备：一千万 token
        // 一千万 token = 10_000_000 * 1e18 = 10_000_000_000_000_000_000_000
        let vault_a = U256::from(10_000_000u128) * U256::from(1_000_000_000_000_000_000u64); // 10,000,000 tokens
        let vault_b = U256::from(10_000_000u128) * U256::from(1_000_000_000_000_000_000u64); // 10,000,000 tokens
        let vault_c = U256::from(10_000_000u128) * U256::from(1_000_000_000_000_000_000u64); // 10,000,000 tokens
        
        // 权重使用 18 位小数
        let weight_a = FixedPoint::ONE; // 1.0
        let weight_b = FixedPoint::ONE; // 1.0
        let weight_c = FixedPoint::ONE; // 1.0
        
        println!("大规模交换测试:");
        println!("  vault_a = {} (10,000,000 tokens)", vault_a);
        println!("  vault_b = {} (10,000,000 tokens)", vault_b);
        println!("  vault_c = {} (10,000,000 tokens)", vault_c);
        
        // 用户输入：1,000,000 tokens (10% of vault)
        let amount_in_a = U256::from(1_000_000u128) * U256::from(1_000_000_000_000_000_000u64); // 1,000,000 tokens
        let amount_in_b = U256::from(1_000_000u128) * U256::from(1_000_000_000_000_000_000u64); // 1,000,000 tokens
        
        println!("  输入: {} tokenA + {} tokenB", amount_in_a, amount_in_b);
        
        // 使用对数增量计算
        let vault_a_i256 = I256::try_from(vault_a).unwrap();
        let vault_b_i256 = I256::try_from(vault_b).unwrap();
        let vault_c_i256 = I256::try_from(vault_c).unwrap();
        
        let ln_a = LogExpMath::ln(vault_a_i256).unwrap();
        let ln_b = LogExpMath::ln(vault_b_i256).unwrap();
        let ln_c = LogExpMath::ln(vault_c_i256).unwrap();
        
        let weight_a_i256 = I256::try_from(weight_a).unwrap();
        let weight_b_i256 = I256::try_from(weight_b).unwrap();
        let weight_c_i256 = I256::try_from(weight_c).unwrap();
        
        let wa_ln_a = (weight_a_i256 * ln_a) / ONE_18;
        let wb_ln_b = (weight_b_i256 * ln_b) / ONE_18;
        let wc_ln_c = (weight_c_i256 * ln_c) / ONE_18;
        
        // 计算交换后的值
        let vault_a_after = vault_a + amount_in_a;
        let vault_b_after = vault_b + amount_in_b;
        
        let vault_a_after_i256 = I256::try_from(vault_a_after).unwrap();
        let vault_b_after_i256 = I256::try_from(vault_b_after).unwrap();
        
        let ln_a_after = LogExpMath::ln(vault_a_after_i256).unwrap();
        let ln_b_after = LogExpMath::ln(vault_b_after_i256).unwrap();
        
        let wa_ln_a_after = (weight_a_i256 * ln_a_after) / ONE_18;
        let wb_ln_b_after = (weight_b_i256 * ln_b_after) / ONE_18;
        
        // 计算增量
        let delta_a = wa_ln_a_after - wa_ln_a;
        let delta_b = wb_ln_b_after - wb_ln_b;
        let delta_total = delta_a + delta_b;
        
        // 计算 c 的减少
        let wc_ln_c_after = wc_ln_c - delta_total;
        let ln_c_after = (wc_ln_c_after * ONE_18) / weight_c_i256;
        
        // 计算输出数量
        let vault_c_after_i256 = LogExpMath::exp(ln_c_after).unwrap();
        let vault_c_after = vault_c_after_i256.to_u256().unwrap();
        let amount_out_c = vault_c - vault_c_after;
        
        println!("  输出: {} tokenC", amount_out_c);
        
        // 验证输出数量合理
        assert!(amount_out_c > U256::zero(), "输出数量应该大于0");
        assert!(vault_c_after <= vault_c, "交换后的储备不应该超过原始储备");
        
        // 验证恒定乘积
        let ln_c_after_check = LogExpMath::ln(vault_c_after_i256).unwrap();
        let wc_ln_c_after_check = (weight_c_i256 * ln_c_after_check) / ONE_18;
        
        let constant_before = wa_ln_a + wb_ln_b + wc_ln_c;
        let constant_after = wa_ln_a_after + wb_ln_b_after + wc_ln_c_after_check;
        
        let delta_constant = constant_before - constant_after;
        let max_error = I256::from(1000000000000000i128); // 0.001 (18 decimals) 的误差容忍度
        
        assert!(
            delta_constant <= max_error && delta_constant >= -max_error,
            "恒定对数和应该在允许误差范围内"
        );
        
        println!("✅ 大规模交换测试通过！");
        println!("  交换前: {} + {} + {}", vault_a, vault_b, vault_c);
        println!("  交换后: {} + {} + {}", vault_a_after, vault_b_after, vault_c_after);
    }
}
