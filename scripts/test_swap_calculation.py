#!/usr/bin/env python3
"""
计算多 token swap 的预期结果
使用权重恒定乘积公式: a^wa * b^wb * c^wc * ... = K

支持：
- 多个输入 token（带索引列表）
- 多个输出 token（带索引列表和最小输出要求）
- 自定义权重列表
- 费率（万分之三）
"""

import math
from typing import List, Tuple, Dict

def calculate_swap_with_lists(
    vaults: List[float],
    weights: List[float],
    amounts_in: List[float],
    in_indices: List[int],
    amounts_out_min: List[float],
    out_indices: List[int],
    fee_rate: float = 0.0003  # 万分之三 = 0.03% = 0.0003
) -> Tuple[List[float], List[float], float, Dict]:
    """
    计算多 token swap（使用输入/输出索引列表）
    
    Args:
        vaults: 初始储备列表（token 数量）
        weights: 权重列表（18 位小数，即乘以 1e18）
        amounts_in: 输入 token 数量列表（对应 in_indices）
        in_indices: 输入 token 的索引列表
        amounts_out_min: 输出 token 最小数量列表（对应 out_indices）
        out_indices: 输出 token 的索引列表
        fee_rate: 费率（默认万分之三 = 0.0003）
    
    Returns:
        (vaults_after, amounts_out, constant_delta, result_info)
        - vaults_after: 交换后的储备列表
        - amounts_out: 实际输出数量列表（对应 out_indices）
        - constant_delta: 恒定乘积（对数形式）的差值
        - result_info: 详细信息字典
    """
    n = len(vaults)
    assert len(weights) == n, "权重数量必须与 token 数量一致"
    assert len(amounts_in) == len(in_indices), "输入数量列表长度必须与输入索引列表一致"
    assert len(amounts_out_min) == len(out_indices), "最小输出数量列表长度必须与输出索引列表一致"
    
    # 步骤2: 应用费率，计算实际输入（扣除费率后）
    burn_fees = [amount * fee_rate for amount in amounts_in]
    amounts_in_after_fee = [amount - burn_fee for (amount, burn_fee) in zip(amounts_in, burn_fees)]
        
    amounts_out = []  # 初始化输出列表
    vaults_after = vaults.copy()
    constant_before = 0
    for i in range(n):
        if i in in_indices or i in out_indices:
            constant_before += weights[i] * math.log(vaults[i])

    print(f"constant_before = {constant_before:.18f}")
    # 累积权重对数的差值（只计算变化的token）
    delta_sum = 0.0
    
    # 处理输入token（储备增加）
    # delta = weights[i] * ln(vaults_after[i])
    for idx, amount_in_after_fee in zip(in_indices, amounts_in_after_fee):
        vault_after = vaults[idx] + amount_in_after_fee
        vaults_after[idx] = vault_after
        delta = weights[idx] * math.log(vault_after)
        print(f"delta = {delta:.18f}")
        delta_sum += delta
    
    # 处理输出token（除了最后一个）
    # delta = weights[i] * ln(vaults_after[i])
    for (idx, amount_out_min) in zip(out_indices[:-1], amounts_out_min[:-1]):
        # 使用最小输出要求（转换为税前）
        vault_after = vaults[idx] - amount_out_min
        vaults_after[idx] = vault_after
        # 检查储备是否足够
        if vault_after <= 0:
            raise ValueError(f"输出 token_{idx} 储备不足: vault_after = {vault_after:,.6f}")
        
        delta = weights[idx] * math.log(vault_after)
        print(f"delta = {delta:.18f}")
        delta_sum += delta
        amounts_out.append(amount_out_min)
    
    # 计算最后一个输出 token 应该的值
    last_idx = out_indices[-1]
    last_weight = weights[last_idx]
    
    # last_delta + sum(weights[i] * ln(vaults_after[i])) = constant_before
    last_delta = constant_before - delta_sum
    print(f"last_delta = {last_delta:.18f}")
    last_ln_vault_after = last_delta / last_weight
    print(f"last_ln_vault_after = {last_ln_vault_after:.18f}")
    last_should_be = math.exp(last_ln_vault_after)
    print(f"last_should_be = {last_should_be:.18f}")


    if last_should_be <= 0:
        raise ValueError(f"输出 token_{last_idx} 储备不足: last_should_be = {last_should_be:,.6f}")
    last_vault_after = last_should_be
    vaults_after[last_idx] = last_vault_after
    
    # 计算输出数量（税前）
    last_amount_out = vaults[last_idx] - last_vault_after
    
    amounts_out.append(last_amount_out)
    
    # 步骤5: 验证恒定乘积
    ln_vaults_before = [math.log(vault) * weights[i] for i, vault in enumerate(vaults)]
    constant_before = sum(ln_vaults_before)
    ln_vaults_after = [math.log(vault) * weights[i] for i, vault in enumerate(vaults_after)]
    constant_after = sum(ln_vaults_after)
    constant_delta = constant_before - constant_after
        
    print(f"  交换前 constant = {constant_before:.18f}")
    print(f"  交换后 constant = {constant_after:.18f}")
    print(f"  差值 = {constant_delta:.18f} (应该接近 0)")
    
    # 构建结果信息
    result_info = {
        'constant_before': constant_before,
        'constant_after': constant_after,
        'constant_delta': constant_delta,
        'amounts_in_after_fee': amounts_in_after_fee,
    }
    
    print(f"\n{'='*80}")
    print(f"计算结果:")
    print(f"{'='*80}")
    print(f"交换后储备:")
    for i, vault_after in enumerate(vaults_after):
        change = vault_after - vaults[i]
        change_pct = (change / vaults[i] * 100) if vaults[i] > 0 else 0
        print(f"  vault_{i}_after = {vault_after:,.6f} tokens (变化: {change:+,.6f}, {change_pct:+.2f}%)")
    
    print(f"\n实际输出（已扣除费率 {fee_rate * 10000:.2f}‱）:")
    for idx, amount_out, amount_out_min in zip(out_indices, amounts_out, amounts_out_min):
        print(f"  amount_out_{idx} = {amount_out:,.6f} tokens (最小要求: {amount_out_min:,.6f})")
    
    print(f"\n恒定乘积差值: {constant_delta:.18f}")
    print(f"{'='*80}")
    
    return vaults_after, amounts_out, constant_delta, result_info


def calculate_slippage(
    vaults: List[float],
    weights: List[float],
    amounts_in: List[float],
    in_indices: List[int],
    amounts_out: List[float],
    out_indices: List[int],
    fee_rate: float = 0.0003
) -> Dict:
    """
    计算滑点（模拟客户端行为，预先计算）
    
    这个函数模拟客户端的行为：给定输入和期望输出，计算最后一个输出 token 的滑点
    
    Args:
        vaults: 初始储备列表
        weights: 权重列表
        amounts_in: 输入 token 数量列表（对应 in_indices）
        in_indices: 输入 token 的索引列表
        amounts_out: 期望输出 token 数量列表（对应 out_indices，最后一个会被计算）
        out_indices: 输出 token 的索引列表
        fee_rate: 费率
    
    Returns:
        包含滑点信息的字典
    """
    n = len(vaults)
    assert len(weights) == n
    assert len(amounts_in) == len(in_indices)
    assert len(amounts_out) == len(out_indices)
    
    print("=" * 80)
    print("滑点计算（模拟客户端行为）")
    print("=" * 80)
    
    # 应用费率
    amounts_in_after_fee = [amount * (1 - fee_rate) for amount in amounts_in]
    
    # 计算交换前的恒定乘积（对数形式）
    oldK = sum(weights[i] * math.log(vaults[i]) for i in range(n))
    
    print(f"\n交换前恒定乘积（对数形式）: {oldK:.18f}")
    
    # 计算新恒定乘积（除了最后一个输出 token）
    # 需要包含所有token（除了最后一个输出token）：
    # 1. 输入token（储备增加）
    # 2. 其他输出token（储备减少）
    # 3. 既不是输入也不是输出的token（储备不变）
    newK_except_last = 0.0
    
    # 处理所有token（除了最后一个输出token）
    for i in range(n):
        if i == out_indices[-1]:
            # 跳过最后一个输出token
            continue
        
        if i in in_indices:
            # 输入token：储备增加
            idx_in_list = in_indices.index(i)
            amount_in_after_fee = amounts_in_after_fee[idx_in_list]
            vault_after = vaults[i] + amount_in_after_fee
            newK_except_last += weights[i] * math.log(vault_after)
            print(f"  输入 token_{i}: vault_after = {vault_after:,.6f}, "
                  f"w*ln = {weights[i] * math.log(vault_after):.18f}")
        elif i in out_indices[:-1]:
            # 其他输出token：储备减少
            idx_in_list = out_indices.index(i)
            amount_out = amounts_out[idx_in_list]
            vault_after = vaults[i] - amount_out
            newK_except_last += weights[i] * math.log(vault_after)
            print(f"  输出 token_{i}: vault_after = {vault_after:,.6f}, "
                  f"w*ln = {weights[i] * math.log(vault_after):.18f}")
        else:
            # 既不是输入也不是输出的token：储备不变
            vault_after = vaults[i]
            newK_except_last += weights[i] * math.log(vault_after)
    
    # 计算最后一个输出 token 应该的值
    last_idx = out_indices[-1]
    last_weight = weights[last_idx]
    last_should_be_ln = (oldK - newK_except_last) / last_weight
    last_should_be = math.exp(last_should_be_ln)
    last_vault_after = last_should_be
    last_amount_out = vaults[last_idx] - last_vault_after
    last_amount_out_after_fee = last_amount_out * (1 - fee_rate)
    
    # 计算滑点
    last_expected = amounts_out[-1]
    last_slip = last_amount_out_after_fee - last_expected
    
    print(f"\n最后一个输出 token_{last_idx}:")
    print(f"  期望输出: {last_expected:,.6f} tokens")
    print(f"  实际输出（税后）: {last_amount_out_after_fee:,.6f} tokens")
    if last_expected > 0:
        print(f"  滑点: {last_slip:,.6f} tokens ({last_slip/last_expected*100:.4f}%)")
    else:
        print(f"  滑点: {last_slip:,.6f} tokens (期望输出为0，无法计算百分比)")
    
    result = {
        'last_index': last_idx,
        'last_expected': last_expected,
        'last_actual': last_amount_out_after_fee,
        'last_slip': last_slip,
        'last_slip_percent': last_slip / last_expected * 100 if last_expected > 0 else 0,
        'oldK': oldK,
        'newK_except_last': newK_except_last,
        'last_vault_after': last_vault_after,
    }
    
    print(f"\n{'='*80}")
    print(f"滑点结果:")
    print(f"  token_{last_idx} 滑点 = {last_slip:,.6f} tokens ({result['last_slip_percent']:.4f}%)")
    print(f"{'='*80}")
    
    return result


def test_case_2():
    """测试用例2：6 token swap，3进2出（权重不同、储备不同、输出不同）"""
    print("\n" + "="*80)
    print("测试用例2：6 token swap，3进2出（权重不同、储备不同、输出不同）")
    print("="*80)
    
    fee_rate = 0.0003  # 万分之三
    vaults = [1e7, 5e7, 1e8, 2e7, 3e7, 4e7]  # 初始储备：各不相同
    weights = [20, 40, 80, 30, 50, 60]  # 权重：各不相同
    amounts_in = [1e5, 2e5, 1.5e5]  # 输入：token 0, 1, 2，数量不同
    in_indices = [0, 1, 2]  # 输入 token 索引
    out_indices = [3, 4]  # 输出 token 索引
    
    # token3期望输出：设置一个合理的值（相对于储备的合理比例）
    token3_expected = 1.2e5  # 120,000 tokens，相对于储备20,000,000是0.6%
    
    # 使用calculate_slippage计算token4的实际输出（基于恒定乘积公式）
    # 这个实际输出就是token4的合理期望输出
    amounts_out_temp = [token3_expected, 0]  # 临时期望输出，token4先设为0（会被计算）
    slip_result = calculate_slippage(
        vaults, weights, amounts_in, in_indices, amounts_out_temp, out_indices, fee_rate
    )
    
    # token4的合理期望输出 = calculate_slippage计算出的实际输出
    token4_expected = slip_result['last_actual']
    
    # 如果token4期望输出为负数或0，说明token3的期望输出设置不合理，需要调整
    if token4_expected <= 0:
        # 减小token3的期望输出，重新计算
        token3_expected = 8e4  # 80,000 tokens
        amounts_out_temp = [token3_expected, 0]
        slip_result = calculate_slippage(
            vaults, weights, amounts_in, in_indices, amounts_out_temp, out_indices, fee_rate
        )
        token4_expected = slip_result['last_actual']
        
        if token4_expected <= 0:
            raise ValueError(f"无法找到合理的期望输出：token3期望输出 {token3_expected:,.6f} 导致token4输出为负数或0")
    
    print(f"\n修正后的期望输出（基于恒定乘积公式计算）:")
    print(f"  token_3 期望输出: {token3_expected:,.6f} tokens")
    print(f"  token_4 期望输出: {token4_expected:,.6f} tokens (根据恒定乘积公式计算)")
    
    # 使用完整函数计算（使用最小输出要求）
    amounts_out = [token3_expected, token4_expected]
    amounts_out_min = [amount * 0.99 for amount in amounts_out]  # 最小输出 = 期望输出的 99%
    
    try:
        vaults_after, amounts_out_actual, delta, info = calculate_swap_with_lists(
            vaults, weights, amounts_in, in_indices, amounts_out_min, out_indices, fee_rate
        )
        print("\n✅ 测试用例2通过！")
        return True
    except Exception as e:
        print(f"\n❌ 测试用例2失败: {e}")
        return False

def test_case_3():
    """测试用例3：30 token swap，10进10出（包含大额交易）"""
    print("\n" + "="*80)
    print("测试用例3：30 token swap，10进10出（包含大额交易）")
    print("="*80)
    
    fee_rate = 0.0003  # 万分之三
    # 30个token的初始储备（随机不同的值）
    vaults = [
        1e10, 5e10, 2e11, 3e10, 8e10, 1.5e11, 4e10, 6e10, 9e10, 1.2e11,  # 0-9
        2.5e10, 7e10, 1.1e11, 3.5e10, 5.5e10, 8.5e10, 1.3e11, 4.5e10, 6.5e10, 9.5e10,  # 10-19
        2e10, 4e10, 7e10, 1e11, 3e10, 5e10, 8e10, 1.1e11, 4e10, 6e10  # 20-29
    ]
    # 30个token的权重（各不相同，9位小数精度）
    weights_base = [
        10, 15, 25, 12, 18, 30, 14, 20, 22, 28,  # 0-9
        16, 24, 26, 13, 19, 23, 29, 11, 21, 27,  # 10-19
        17, 15, 20, 25, 12, 18, 22, 28, 14, 16   # 20-29
    ]
    weights = [w * 1e9 for w in weights_base]  # 乘以10e9模拟9位小数
    # 10个输入token（索引0-9），包含大额
    amounts_in = [
        5e12,     # token 0: 5万亿（超过10e12）
        1e9,      # token 1: 10亿
        5e9,      # token 2: 50亿
        2e9,      # token 3: 20亿
        8e9,      # token 4: 80亿
        3e9,      # token 5: 30亿
        1.5e9,    # token 6: 15亿
        6e9,      # token 7: 60亿
        4e9,      # token 8: 40亿
        2.5e9     # token 9: 25亿
    ]
    in_indices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]  # 输入 token 索引
    out_indices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]  # 输出 token 索引
    
    # 先设置前9个输出token的期望值（相对于储备的合理比例）
    amounts_out_temp = [
        5e8,   # token 10
        1e9,   # token 11
        1.5e9, # token 12
        6e8,   # token 13
        8e8,   # token 14
        1.2e9, # token 15
        2e9,   # token 16
        7e8,   # token 17
        9e8,   # token 18
        0      # token 19: 最后一个，待计算
    ]
    
    # 使用calculate_slippage计算最后一个输出token
    slip_result = calculate_slippage(
        vaults, weights, amounts_in, in_indices, amounts_out_temp, out_indices, fee_rate
    )
    
    # 获取最后一个token的实际输出
    last_token_output = slip_result['last_actual']
    
    if last_token_output <= 0:
        print(f"\n❌ 无法找到合理的期望输出：最后一个token输出为负数或0")
        return False
    else:
        print(f"\n修正后的期望输出（基于恒定乘积公式计算）:")
        for i, amount in enumerate(amounts_out_temp[:-1]):
            print(f"  token_{out_indices[i]} 期望输出: {amount:,.2f} tokens")
        print(f"  token_{out_indices[-1]} 期望输出: {last_token_output:,.2f} tokens (根据恒定乘积公式计算)")
        
        # 使用完整函数计算（使用最小输出要求）
        amounts_out = amounts_out_temp[:-1] + [last_token_output]
        amounts_out_min = [amount * 0.99 for amount in amounts_out]  # 最小输出 = 期望输出的 99%
        
        try:
            vaults_after, amounts_out_actual, delta, info = calculate_swap_with_lists(
                vaults, weights, amounts_in, in_indices, amounts_out_min, out_indices, fee_rate
            )
            print("\n✅ 测试用例3通过！")
            
            # 打印生成的Rust测试数据
            print("\n" + "="*80)
            print("Rust测试数据（复制到测试代码中）:")
            print("="*80)
            print(f"\n// 池子储备（30个token）")
            print(f"let token_vaults_amount: Vec<u64> = vec![")
            for i in range(0, len(vaults), 5):
                chunk = vaults[i:i+5]
                line = ", ".join([f"{int(v)}u64" for v in chunk])
                print(f"    {line},  // tokens {i}-{i+len(chunk)-1}")
            print(f"];")
            
            print(f"\n// 权重（30个token，9位小数精度，已乘以1e9）")
            print(f"let weights: Vec<u64> = vec![")
            for i in range(0, len(weights), 5):
                chunk = weights[i:i+5]
                line = ", ".join([f"{int(w)}u64" for w in chunk])
                print(f"    {line},  // tokens {i}-{i+len(chunk)-1}")
            print(f"];")
            
            print(f"\n// 输入token的tolerance（10个，索引0-9）")
            print(f"let amounts_in_tolerance: Vec<u64> = vec![")
            for i, amount in enumerate(amounts_in):
                print(f"    {int(amount)}u64,  // token {i}")
            print(f"];")
            
            print(f"\n// 输出token的最小要求（10个，索引10-19，99%期望值）")
            print(f"let amounts_out_min: Vec<u64> = vec![")
            for i, amount in enumerate(amounts_out_min):
                print(f"    {int(amount)}u64,  // token {10+i}")
            print(f"];")
            
            print(f"\n// 预期输出（用于验证）")
            print(f"let expected_outputs: Vec<u64> = vec![")
            for i, amount in enumerate(amounts_out):
                print(f"    {int(amount)}u64,  // token {10+i}")
            print(f"];")
            
            return True
        except Exception as e:
            print(f"\n❌ 测试用例3失败: {e}")
            return False

if __name__ == "__main__":
    # test_case_2()
    test_case_3()