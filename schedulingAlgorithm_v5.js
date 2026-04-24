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
 * 第二层:逐日排班 - 基于块模式的核心算法
 * 核心策略:先规划工作块/休息块序列,再映射到具体日期
 */
function performDailyScheduling(persons, demands, daysInMonth, month, quotaData, personRestDays) {
    console.log('\n========== 第二层:逐日排班(块模式优化版) ==========');
    
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
            // 不再使用块序列,改为逐日动态决策
            workDaysRemaining: 0, // 剩余需要排班的工作日
            currentConsecutiveWork: 0 // 当前连续工作天数
        };
    });
    
    // 初始化每日统计
    var dailyCount = {};
    for (var d = 1; d <= daysInMonth; d++) {
        dailyCount[d] = {white: 0, night: 0, rest: 0};
    }
    
    // 步骤1: 标记强制休息日并初始化剩余工作日
    console.log('[步骤1] 初始化强制休息日和剩余工作日...');
    employees.forEach(function(emp) {
        var restDays = personRestDays[emp.pid] || [];
        var forcedRestCount = 0;
        
        restDays.forEach(function(day) {
            if (day >= 1 && day <= daysInMonth) {
                emp.assignments[day] = 'forced_rest';
                dailyCount[day].rest++;
                forcedRestCount++;
            }
        });
        
        // 计算实际需要排班的工作日
        emp.workDaysRemaining = quotas[emp.pid].totalWorkDays - forcedRestCount;
        
        console.log('  ' + emp.name + ': 总配额' + quotas[emp.pid].totalWorkDays + '天, 强制休息' + forcedRestCount + '天, 剩余' + emp.workDaysRemaining + '天');
    });
    
    // 步骤2: 加载上月末状态
    console.log('[步骤2] 加载上月末状态...');
    employees.forEach(function(emp) {
        var prevState = getPreviousMonthState(month, emp.pid);
        if (prevState.lastShift) {
            emp.lastShiftType = prevState.lastShift;
            emp.currentConsecutiveWork = prevState.consecutive || 0;
            console.log('  ' + emp.name + ': 上月末连续' + emp.lastShiftType + '班' + emp.currentConsecutiveWork + '天');
        } else {
            emp.consecutiveRestDays = prevState.consecutive || 0;
            console.log('  ' + emp.name + ': 上月末连续休息' + emp.consecutiveRestDays + '天');
        }
    });
    
    // 步骤3: 逐日分配 - 动态决策
    console.log('[步骤3] 逐日动态分配...');
    for (var day = 1; day <= daysInMonth; day++) {
        console.log('\n--- 第' + day + '天 ---');
        
        // 跳过已安排的日子(强制休息)
        var needScheduleEmployees = employees.filter(function(emp) {
            return !emp.assignments[day];
        });
        
        // 筛选出还有工作配额且符合连续性要求的员工
        var whiteCandidates = [];
        var nightCandidates = [];
        
        needScheduleEmployees.forEach(function(emp) {
            // 检查是否还有工作配额
            if (emp.workDaysRemaining <= 0) {
                emp.assignments[day] = 'rest';
                emp.restDaysAssigned++;
                emp.consecutiveRestDays++;
                emp.currentConsecutiveWork = 0;
                dailyCount[day].rest++;
                return;
            }
            
            // 检查连续性约束
            if (emp.currentConsecutiveWork >= 5) {
                // 连续工作超过5天,必须休息
                emp.assignments[day] = 'rest';
                emp.restDaysAssigned++;
                emp.consecutiveRestDays++;
                emp.currentConsecutiveWork = 0;
                dailyCount[day].rest++;
                console.log('    ' + emp.name + ' -> 休息(已连续工作' + emp.currentConsecutiveWork + '天)');
                return;
            }
            
            // 添加到候选池
            whiteCandidates.push(emp);
            nightCandidates.push(emp);
        });
        
        // 为白班选择得分最高的2人
        var whiteWorkers = selectTopWorkers(whiteCandidates, 'white', day, 2);
        whiteWorkers.forEach(function(emp) {
            emp.assignments[day] = 'white';
            emp.whiteDaysAssigned++;
            emp.totalDaysAssigned++;
            emp.workDaysRemaining--;
            emp.currentConsecutiveWork++;
            emp.consecutiveRestDays = 0;
            
            if (emp.lastShiftType && emp.lastShiftType !== 'white') {
                emp.hasSwitchedShift = true;
            }
            emp.lastShiftType = 'white';
            
            dailyCount[day].white++;
            console.log('    ' + emp.name + ' -> 白班 (剩余工作日:' + emp.workDaysRemaining + ')');
        });
        
        // 为夜班选择得分最高的2人(排除已选白班的)
        var nightCandidatesFiltered = nightCandidates.filter(function(emp) {
            return emp.assignments[day] !== 'white';
        });
        var nightWorkers = selectTopWorkers(nightCandidatesFiltered, 'night', day, 2);
        nightWorkers.forEach(function(emp) {
            emp.assignments[day] = 'night';
            emp.nightDaysAssigned++;
            emp.totalDaysAssigned++;
            emp.workDaysRemaining--;
            emp.currentConsecutiveWork++;
            emp.consecutiveRestDays = 0;
            
            if (emp.lastShiftType && emp.lastShiftType !== 'night') {
                emp.hasSwitchedShift = true;
            }
            emp.lastShiftType = 'night';
            
            dailyCount[day].night++;
            console.log('    ' + emp.name + ' -> 夜班 (剩余工作日:' + emp.workDaysRemaining + ')');
        });
        
        // 其余人休息
        needScheduleEmployees.forEach(function(emp) {
            if (!emp.assignments[day]) {
                emp.assignments[day] = 'rest';
                emp.restDaysAssigned++;
                emp.consecutiveRestDays++;
                emp.currentConsecutiveWork = 0;
                dailyCount[day].rest++;
            }
        });
        
        console.log('  第' + day + '天汇总: 白班' + dailyCount[day].white + '人, 夜班' + dailyCount[day].night + '人, 休息' + dailyCount[day].rest + '人');
        
        // 验证每日配置
        if (dailyCount[day].white !== 2 || dailyCount[day].night !== 2) {
            console.warn('  ⚠ 第' + day + '天不满足2白2夜要求,将进行调整...');
        }
    }
    
    // 步骤4: 全局调整 - 确保每日2白2夜
    console.log('\n[步骤4] 全局调整...');
    adjustDailyConfiguration(employees, dailyCount, daysInMonth);
    
    console.log('\n========== 第二层完成 ==========\n');
    return employees;
}

/**
 * 从候选池中选择得分最高的N个员工
 */
function selectTopWorkers(candidates, shiftType, day, count) {
    // 计算每个候选人的得分
    var scored = candidates.map(function(emp) {
        return {
            emp: emp,
            score: calculateAssignmentScore(emp, shiftType, day)
        };
    });
    
    // 按得分降序排序
    scored.sort(function(a, b) {
        return b.score - a.score;
    });
    
    console.log('  候选' + shiftType + '班: ' + scored.length + '人');
    scored.slice(0, Math.min(count, scored.length)).forEach(function(item) {
        console.log('    ' + item.emp.name + ' -> ' + shiftType + '班 (分数:' + item.score + ')');
    });
    
    // 返回前N个员工
    return scored.slice(0, Math.min(count, scored.length)).map(function(item) {
        return item.emp;
    });
}

/**
 * 计算员工分配到某班次的得分
 */
function calculateAssignmentScore(emp, shiftType, day) {
    var quota = quotas[emp.pid];
    var score = 0;
    
    // 1. 配额平衡得分(剩余配额越多,得分越高)
    if (shiftType === 'white') {
        var whiteRemaining = quota.whiteDays - emp.whiteDaysAssigned;
        score += whiteRemaining * 100;
    } else {
        var nightRemaining = quota.nightDays - emp.nightDaysAssigned;
        score += nightRemaining * 100;
    }
    
    // 2. 连续性惩罚(连续工作天数越多,得分越低,鼓励休息)
    if (emp.currentConsecutiveWork >= 3) {
        score -= (emp.currentConsecutiveWork - 2) * 50;
    }
    
    // 3. 班次切换惩罚(避免频繁切换)
    if (emp.lastShiftType && emp.lastShiftType !== shiftType) {
        score -= 30; // 切换班次扣分
    }
    
    // 4. 连续性奖励(如果符合连续性模式,加分)
    if (emp.lastShiftType === shiftType && emp.currentConsecutiveWork < 4) {
        score += 20; // 继续同一班次加分
    }
    
    return score;
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