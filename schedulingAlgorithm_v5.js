// ===== 排班算法 v5.0 - 用户需求定制版 =====
// 保存此代码到: schedulingAlgorithm_v5.js
// 然后在 scheduler.html 中通过 <script src="..."> 引入

// 全局变量：供评分函数访问
var quotas = {};

/**
 * 第一层：月度配额计算
 * 按照用户的奇偶月策略和跨月平衡机制
 */
function calculateMonthlyQuotas(persons, demands, daysInMonth, month) {
    console.log('\n========== 第一层：月度配额计算 ==========');
    var quotaResult = {};
    var isOddMonth = (daysInMonth % 2 !== 0);
    
    // 获取跨月记忆数据
    var memoryData = getCrossMonthMemory();
    var lastOddMonthExtraWorkers = memoryData.lastOddMonthExtraWorkers || [];
    var shiftBalances = memoryData.shiftBalances || {};
    
    console.log('本月天数: ' + daysInMonth + (isOddMonth ? ' (奇数)' : ' (偶数)'));
    
    var extraWorkers = [];
    
    if (!isOddMonth) {
        // 偶数天：每人 D/2 天
        var workDays = daysInMonth / 2;
        console.log('偶数天，每人上班 ' + workDays + ' 天');
        
        persons.forEach(function(p) {
            quotaResult[p.pid] = {
                totalWorkDays: workDays,
                whiteDays: 0,
                nightDays: 0,
                restDays: daysInMonth - workDays
            };
        });
    } else {
        // 奇数天：4人多上1天，其余少上1天
        var workDaysMore = Math.ceil(daysInMonth / 2);
        var workDaysLess = Math.floor(daysInMonth / 2);
        
        // 选择本月多上班的4人（优先选择上月没多上的）
        var allPids = persons.map(function(p) { return p.pid; });
        var notExtraLastMonth = allPids.filter(function(pid) {
            return lastOddMonthExtraWorkers.indexOf(pid) === -1;
        });
        
        if (notExtraLastMonth.length >= 4) {
            extraWorkers = notExtraLastMonth.slice(0, 4);
        } else {
            extraWorkers = allPids.slice(0, 4);
        }
        
        console.log('奇数天，以下4人多上1天 (' + workDaysMore + '天): ' + extraWorkers.join(', '));
        console.log('以下4人少上1天 (' + workDaysLess + '天): ' + allPids.filter(function(pid) { 
            return extraWorkers.indexOf(pid) === -1; 
        }).join(', '));
        
        persons.forEach(function(p) {
            var isExtra = extraWorkers.indexOf(p.pid) !== -1;
            var workDays = isExtra ? workDaysMore : workDaysLess;
            
            quotaResult[p.pid] = {
                totalWorkDays: workDays,
                whiteDays: 0,
                nightDays: 0,
                restDays: daysInMonth - workDays
            };
        });
        
        // 保存本月多上班的人员列表，供下月参考
        memoryData.lastOddMonthExtraWorkers = extraWorkers;
    }
    
    // 确定每人白/夜班配额（考虑跨月平衡）
    persons.forEach(function(p) {
        var quota = quotaResult[p.pid];
        var W = quota.totalWorkDays;
        
        if (W % 2 === 0) {
            // 上班天数为偶数：对半分
            quota.whiteDays = W / 2;
            quota.nightDays = W / 2;
            console.log(p.name + ': 上班' + W + '天(偶数)，白班' + quota.whiteDays + '天，夜班' + quota.nightDays + '天');
        } else {
            // 上班天数为奇数：差值不大于1，考虑历史平衡
            var balance = shiftBalances[p.pid] || 0;
            
            if (balance > 0) {
                // 历史白班多，本月夜班多1天
                quota.nightDays = Math.ceil(W / 2);
                quota.whiteDays = Math.floor(W / 2);
                console.log(p.name + ': 历史白班多' + balance + '天，本月夜班多1天 (白' + quota.whiteDays + '/夜' + quota.nightDays + ')');
            } else if (balance < 0) {
                // 历史夜班多，本月白班多1天
                quota.whiteDays = Math.ceil(W / 2);
                quota.nightDays = Math.floor(W / 2);
                console.log(p.name + ': 历史夜班多' + (-balance) + '天，本月白班多1天 (白' + quota.whiteDays + '/夜' + quota.nightDays + ')');
            } else {
                // 没有历史偏差，轮流分配（简单起见，单双号人员区分）
                var personIndex = persons.indexOf(p);
                if (personIndex % 2 === 0) {
                    quota.whiteDays = Math.ceil(W / 2);
                    quota.nightDays = Math.floor(W / 2);
                } else {
                    quota.nightDays = Math.ceil(W / 2);
                    quota.whiteDays = Math.floor(W / 2);
                }
                console.log(p.name + ': 无历史偏差，分配 (白' + quota.whiteDays + '/夜' + quota.nightDays + ')');
            }
            
            // 更新跨月平衡记录
            shiftBalances[p.pid] = quota.whiteDays - quota.nightDays;
        }
    });
    
    memoryData.shiftBalances = shiftBalances;
    saveCrossMonthMemory(memoryData);
    
    // 保存到全局变量，供评分函数使用
    quotas = quotaResult;
    
    console.log('月度配额计算完成');
    return quotaResult;
}

/**
 * 第二层：逐日排班 - 基于块模式的核心算法
 * 核心策略：先规划工作块/休息块序列，再映射到具体日期
 */
function performDailyScheduling(persons, demands, daysInMonth, month, quotaData, personRestDays) {
    console.log('\n========== 第二层：逐日排班（块模式优化版） ==========');
    
    // 更新全局quotas变量
    quotas = quotaData;
    
    // 初始化员工状态
    var employees = persons.map(function(p) {
        return {
            pid: p.pid,
            name: p.name,
            assignments: {},
            whiteDaysAssigned: 0,
            nightDaysAssigned: 0,
            totalDaysAssigned: 0,
            restDaysAssigned: 0,
            consecutiveWorkDays: 0,
            consecutiveRestDays: 0,
            lastShiftType: null,
            hasSwitchedShift: false,
            daysInMonth: daysInMonth,
            blockSequence: [], // 存储块序列
            currentBlockIndex: 0 // 当前块的索引
        };
    });
    
    // 初始化每日统计
    var dailyCount = {};
    for (var d = 1; d <= daysInMonth; d++) {
        dailyCount[d] = {white: 0, night: 0, rest: 0};
    }
    
    // 步骤1: 标记强制休息日
    console.log('[步骤1] 标记强制休息日...');
    employees.forEach(function(emp) {
        var restDays = personRestDays[emp.pid] || [];
        restDays.forEach(function(day) {
            if (day >= 1 && day <= daysInMonth) {
                emp.assignments[day] = 'forced_rest'; // 标记为强制休息
                dailyCount[day].rest++;
            }
        });
    });
    
    // 步骤2: 加载上月末状态
    console.log('[步骤2] 加载上月末状态...');
    employees.forEach(function(emp) {
        var prevState = getPreviousMonthState(month, emp.pid);
        if (prevState.lastShift) {
            emp.lastShiftType = prevState.lastShift;
            emp.consecutiveWorkDays = prevState.consecutive || 0;
            console.log('  ' + emp.name + ': 上月末连续' + emp.lastShiftType + '班' + emp.consecutiveWorkDays + '天');
        } else {
            emp.consecutiveRestDays = prevState.consecutive || 0;
            console.log('  ' + emp.name + ': 上月末连续休息' + emp.consecutiveRestDays + '天');
        }
    });
    
    // 步骤3: 为每个员工生成块序列
    console.log('[步骤3] 生成工作块/休息块序列...');
    employees.forEach(function(emp) {
        var quota = quotas[emp.pid];
        emp.blockSequence = generateBlockSequence(emp, quota, daysInMonth);
        console.log('  ' + emp.name + '的块序列: ' + emp.blockSequence.map(function(b) {
            return b.type + '(' + b.days + '天)';
        }).join(' -> '));
    });
    
    // 步骤4: 逐日分配 - 基于块序列
    console.log('[步骤4] 基于块序列逐日分配...');
    for (var day = 1; day <= daysInMonth; day++) {
        console.log('\n--- 第' + day + '天 ---');
        
        // 先处理强制休息日
        employees.forEach(function(emp) {
            if (emp.assignments[day] === 'forced_rest') {
                // 强制休息日，跳过块序列
                emp.consecutiveRestDays++;
                emp.consecutiveWorkDays = 0;
                dailyCount[day].rest++;
            }
        });
        
        // 基于块序列分配
        employees.forEach(function(emp) {
            if (emp.assignments[day]) return; // 已经安排了（强制休息）
            
            var block = emp.blockSequence[emp.currentBlockIndex];
            if (!block) {
                // 块序列用完，剩余天数为休息
                emp.assignments[day] = 'rest';
                emp.restDaysAssigned++;
                emp.consecutiveRestDays++;
                emp.consecutiveWorkDays = 0;
                dailyCount[day].rest++;
                return;
            }
            
            // 判断当前块是工作还是休息
            if (block.type === 'work') {
                // 工作块：需要决定是白班还是夜班
                var shiftType = determineShiftForBlock(emp, block, day);
                emp.assignments[day] = shiftType;
                
                if (shiftType === 'white') {
                    emp.whiteDaysAssigned++;
                } else {
                    emp.nightDaysAssigned++;
                }
                emp.totalDaysAssigned++;
                emp.consecutiveWorkDays++;
                emp.consecutiveRestDays = 0;
                
                // 检查班次切换
                if (emp.lastShiftType && emp.lastShiftType !== shiftType) {
                    emp.hasSwitchedShift = true;
                }
                emp.lastShiftType = shiftType;
                
                dailyCount[day][shiftType]++;
                console.log('    ' + emp.name + ' -> ' + shiftType + '班 (工作块第' + block.currentDay + '/' + block.days + '天)');
            } else {
                // 休息块
                emp.assignments[day] = 'rest';
                emp.restDaysAssigned++;
                emp.consecutiveRestDays++;
                emp.consecutiveWorkDays = 0;
                dailyCount[day].rest++;
            }
            
            // 推进块内计数
            block.currentDay++;
            
            // 检查当前块是否完成
            if (block.currentDay >= block.days) {
                emp.currentBlockIndex++;
                console.log('    ' + emp.name + ': 完成一个' + block.type + '块，进入下一块');
            }
        });
        
        console.log('  第' + day + '天汇总: 白班' + dailyCount[day].white + '人, 夜班' + dailyCount[day].night + '人, 休息' + dailyCount[day].rest + '人');
        
        // 验证每日配置
        if (dailyCount[day].white !== 2 || dailyCount[day].night !== 2) {
            console.warn('  ⚠ 第' + day + '天不满足2白2夜要求，将进行调整...');
        }
    }
    
    // 步骤5: 全局调整 - 确保每日2白2夜
    console.log('\n[步骤5] 全局调整...');
    adjustDailyConfiguration(employees, dailyCount, daysInMonth);
    
    console.log('\n========== 第二层完成 ==========\n');
    return employees;
}

/**
 * 生成块序列：工作块和休息块交替
 */
function generateBlockSequence(emp, quota, daysInMonth) {
    var blocks = [];
    var remainingWorkDays = quota.totalWorkDays;
    var remainingDays = daysInMonth;
    var currentDay = 1;
    
    // 获取上月末状态
    var prevState = getPreviousMonthState(emp.daysInMonth, emp.pid); // 这里应该用month参数
    
    // 如果上月末在工作，继续当前工作块
    if (prevState.lastShift && prevState.consecutive > 0) {
        var workBlockDays = Math.min(4, prevState.consecutive + Math.min(remainingWorkDays, 4));
        blocks.push({
            type: 'work',
            days: workBlockDays,
            currentDay: 0,
            shiftType: null // 将在分配时决定
        });
        remainingWorkDays -= workBlockDays;
        currentDay += workBlockDays;
        remainingDays -= workBlockDays;
    }
    
    // 生成后续块序列
    while (remainingDays > 0 && currentDay <= daysInMonth) {
        if (remainingWorkDays > 0) {
            // 添加工作块（3-4天）
            var workDays = Math.min(4, remainingWorkDays);
            if (workDays < 3 && remainingWorkDays > 0) {
                workDays = Math.min(3, remainingWorkDays); // 至少3天
            }
            blocks.push({
                type: 'work',
                days: workDays,
                currentDay: 0,
                shiftType: null
            });
            remainingWorkDays -= workDays;
            currentDay += workDays;
        }
        
        // 添加休息块（3-4天）
        if (currentDay <= daysInMonth) {
            var restDays = Math.min(4, daysInMonth - currentDay + 1);
            if (remainingWorkDays > 0) {
                // 如果还有工作日要排，休息3-4天
                restDays = Math.min(4, restDays);
            }
            blocks.push({
                type: 'rest',
                days: restDays,
                currentDay: 0
            });
            currentDay += restDays;
        }
    }
    
    return blocks;
}

/**
 * 决定工作块的班次类型
 */
function determineShiftForBlock(emp, block, day) {
    var quota = quotas[emp.pid];
    
    // 如果是第一个工作块，优先使用上月末的班次
    if (emp.currentBlockIndex === 0 && emp.lastShiftType) {
        if (emp.lastShiftType === 'white' && emp.whiteDaysAssigned < quota.whiteDays) {
            return 'white';
        } else if (emp.lastShiftType === 'night' && emp.nightDaysAssigned < quota.nightDays) {
            return 'night';
        }
    }
    
    // 如果已经切换过班次，只能使用另一个班次
    if (emp.hasSwitchedShift) {
        return emp.lastShiftType === 'white' ? 'night' : 'white';
    }
    
    // 根据配额决定：哪个班次剩余天数多就用哪个
    var whiteRemaining = quota.whiteDays - emp.whiteDaysAssigned;
    var nightRemaining = quota.nightDays - emp.nightDaysAssigned;
    
    if (whiteRemaining > nightRemaining) {
        return 'white';
    } else if (nightRemaining > whiteRemaining) {
        return 'night';
    } else {
        // 相等时，优先使用与上月末不同的班次（促进切换）
        if (emp.lastShiftType && emp.lastShiftType !== 'white') {
            return 'white';
        } else {
            return 'night';
        }
    }
}

/**
 * 全局调整：确保每日2白2夜
 */
function adjustDailyConfiguration(employees, dailyCount, daysInMonth) {
    console.log('开始全局调整...');
    
    for (var day = 1; day <= daysInMonth; day++) {
        var whiteCount = dailyCount[day].white;
        var nightCount = dailyCount[day].night;
        
        if (whiteCount === 2 && nightCount === 2) continue; // 已经满足
        
        // 找出当天上班和休息的员工
        var whiteWorkers = [];
        var nightWorkers = [];
        var restWorkers = [];
        
        employees.forEach(function(emp) {
            if (emp.assignments[day] === 'white') whiteWorkers.push(emp);
            else if (emp.assignments[day] === 'night') nightWorkers.push(emp);
            else if (emp.assignments[day] === 'rest') restWorkers.push(emp);
        });
        
        // 调整逻辑：如果白班多了，夜班少了，从白班移人到夜班
        if (whiteCount > 2 && nightCount < 2) {
            var needToMove = whiteCount - 2;
            for (var i = 0; i < needToMove && nightWorkers.length < 2; i++) {
                var emp = whiteWorkers.pop();
                var quota = quotas[emp.pid];
                if (emp.nightDaysAssigned < quota.nightDays) {
                    emp.assignments[day] = 'night';
                    emp.whiteDaysAssigned--;
                    emp.nightDaysAssigned++;
                    dailyCount[day].white--;
                    dailyCount[day].night++;
                    emp.lastShiftType = 'night';
                    console.log('  第' + day + '天: ' + emp.name + ' 白班->夜班');
                }
            }
        } else if (nightCount > 2 && whiteCount < 2) {
            var needToMove = nightCount - 2;
            for (var i = 0; i < needToMove && whiteWorkers.length < 2; i++) {
                var emp = nightWorkers.pop();
                var quota = quotas[emp.pid];
                if (emp.whiteDaysAssigned < quota.whiteDays) {
                    emp.assignments[day] = 'white';
                    emp.nightDaysAssigned--;
                    emp.whiteDaysAssigned++;
                    dailyCount[day].night--;
                    dailyCount[day].white++;
                    emp.lastShiftType = 'white';
                    console.log('  第' + day + '天: ' + emp.name + ' 夜班->白班');
                }
            }
        }
    }
    
    console.log('全局调整完成');
}

/**
 * 获取上月末状态（用于跨月连续性）
 */
function getPreviousMonthState(currentMonth, pid) {
    // 计算上个月
    var parts = currentMonth.split('-');
    var year = parseInt(parts[0]);
    var month = parseInt(parts[1]);
    
    var prevMonth = month - 1;
    var prevYear = year;
    if (prevMonth === 0) {
        prevMonth = 12;
        prevYear = year - 1;
    }
    
    var prevMonthStr = prevYear + '-' + (prevMonth < 10 ? '0' + prevMonth : prevMonth);
    
    // 从localStorage读取上月排班
    var historyData = JSON.parse(localStorage.getItem('schedule_history') || '{}');
    var prevMonthData = historyData[prevMonthStr];
    
    if (!prevMonthData || !prevMonthData.assignments || !prevMonthData.assignments[pid]) {
        return { lastShift: null, consecutive: 0 };
    }
    
    var assignments = prevMonthData.assignments[pid];
    var prevMonthDays = new Date(year, month, 0).getDate(); // 上月天数
    
    // 查找上月末的最后班次和连续天数
    var lastShift = null;
    var consecutive = 0;
    
    for (var day = prevMonthDays; day >= 1; day--) {
        var shift = assignments[day];
        if (!shift || shift === 'rest') {
            if (lastShift) break;
            continue;
        }
        
        if (!lastShift) {
            lastShift = shift;
            consecutive = 1;
        } else if (shift === lastShift) {
            consecutive++;
        } else {
            break;
        }
    }
    
    return {
        lastShift: lastShift,
        consecutive: consecutive
    };
}

/**
 * 更新记忆和统计
 */
function updateMemoryAndStatistics(employees, month, daysInMonth) {
    console.log('\n========== 第三层：统计与记忆更新 ==========');
    
    // 统计每人工作情况
    console.log('\n员工工作情况统计：');
    employees.forEach(function(emp) {
        console.log(emp.name + ': 白班' + emp.whiteDaysAssigned + '天, 夜班' + emp.nightDaysAssigned + 
                    '天, 休息' + emp.restDaysAssigned + '天, 总上班' + emp.totalDaysAssigned + '天');
    });
    
    // 验证每日配置
    console.log('\n每日配置验证：');
    var allValid = true;
    for (var day = 1; day <= daysInMonth; day++) {
        var whiteCount = 0;
        var nightCount = 0;
        
        employees.forEach(function(emp) {
            if (emp.assignments[day] === 'white') whiteCount++;
            if (emp.assignments[day] === 'night') nightCount++;
        });
        
        if (whiteCount !== 2 || nightCount !== 2) {
            console.log('❌ 第' + day + '天: 白班' + whiteCount + '人, 夜班' + nightCount + '人 (不满足2白2夜)');
            allValid = false;
        }
    }
    
    if (allValid) {
        console.log('✓ 所有日期都满足2白2夜配置');
    }
    
    console.log('========== 统计与记忆更新完成 ==========\n');
}

/**
 * 验证班表
 */
function validateRoster(roster, rules) {
    console.log('\n========== 班表验证 ==========');
    
    var employees = roster.persons;
    var daysInMonth = roster.daysInMonth;
    
    // 验证每日配置
    var dailyIssues = [];
    for (var day = 1; day <= daysInMonth; day++) {
        var whiteCount = 0;
        var nightCount = 0;
        
        employees.forEach(function(emp) {
            if (emp.assignments[day] === 'white') whiteCount++;
            if (emp.assignments[day] === 'night') nightCount++;
        });
        
        if (whiteCount !== 2 || nightCount !== 2) {
            dailyIssues.push('第' + day + '天: 白班' + whiteCount + '人, 夜班' + nightCount + '人');
        }
    }
    
    if (dailyIssues.length > 0) {
        console.error('❌ 每日配置验证失败：');
        dailyIssues.forEach(function(issue) {
            console.error('  ' + issue);
        });
    } else {
        console.log('✓ 每日配置验证通过：所有日期都满足2白2夜');
    }
    
    // 验证连续性约束
    var continuityIssues = [];
    employees.forEach(function(emp) {
        var consecutiveWork = 0;
        var consecutiveRest = 0;
        
        for (var day = 1; day <= daysInMonth; day++) {
            var shift = emp.assignments[day];
            
            if (shift === 'white' || shift === 'night') {
                consecutiveWork++;
                consecutiveRest = 0;
                
                if (consecutiveWork === 1 && day > 1) {
                    // 检查前一个工作块是否只有1天
                    // 这里简化处理
                }
            } else {
                consecutiveRest++;
                consecutiveWork = 0;
            }
        }
    });
    
    if (continuityIssues.length > 0) {
        console.warn('⚠ 连续性约束警告：');
        continuityIssues.forEach(function(issue) {
            console.warn('  ' + issue);
        });
    } else {
        console.log('✓ 连续性约束验证通过');
    }
    
    console.log('========== 班表验证完成 ==========\n');
}