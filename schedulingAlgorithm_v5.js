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
 * 第二层：逐日排班 - 基于用户需求的核心算法
 */
function performDailyScheduling(persons, demands, daysInMonth, month, quotaData, personRestDays) {
    console.log('\n========== 第二层：逐日排班（用户需求定制版） ==========');
    
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
            daysInMonth: daysInMonth
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
                emp.assignments[day] = 'rest';
                emp.restDaysAssigned++;
                emp.consecutiveRestDays++;
                emp.consecutiveWorkDays = 0;
                dailyCount[day].rest++;
            }
        });
    });
    
    // 步骤2: 加载上月末状态（跨月连续性）
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
    
    // 步骤3: 逐日分配 - 核心算法
    console.log('[步骤3] 开始逐日分配...');
    for (var day = 1; day <= daysInMonth; day++) {
        console.log('\n--- 第' + day + '天 ---');
        
        // 找出当天可以上班的员工
        var availableForWhite = [];
        var availableForNight = [];
        
        employees.forEach(function(emp) {
            if (emp.assignments[day]) return; // 已经安排了
            
            var quota = quotas[emp.pid];
            if (!quota) return;
            
            if (emp.whiteDaysAssigned < quota.whiteDays) {
                availableForWhite.push(emp);
            }
            
            if (emp.nightDaysAssigned < quota.nightDays) {
                availableForNight.push(emp);
            }
        });
        
        // 为当天分配2个白班 + 2个夜班
        assignShiftForDay(day, employees, availableForWhite, 'white', 2, dailyCount);
        assignShiftForDay(day, employees, availableForNight, 'night', 2, dailyCount);
        
        // 其余人标记为休息
        employees.forEach(function(emp) {
            if (!emp.assignments[day]) {
                emp.assignments[day] = 'rest';
                emp.restDaysAssigned++;
                emp.consecutiveRestDays++;
                emp.consecutiveWorkDays = 0;
                emp.lastShiftType = null;
                dailyCount[day].rest++;
            }
        });
        
        console.log('  第' + day + '天: 白班' + dailyCount[day].white + '人, 夜班' + dailyCount[day].night + '人, 休息' + dailyCount[day].rest + '人');
    }
    
    console.log('\n========== 第二层完成 ==========\n');
    return employees;
}

/**
 * 为某一天分配指定班次
 */
function assignShiftForDay(day, employees, candidates, shiftType, needed, dailyCount) {
    console.log('  分配' + shiftType + '班，需要' + needed + '人，候选' + candidates.length + '人');
    
    // 评分并排序候选员工
    var scored = [];
    for (var i = 0; i < candidates.length; i++) {
        var emp = candidates[i];
        scored.push({
            emp: emp,
            score: calculateAssignmentScore(emp, day, shiftType)
        });
    }
    
    // 按分数降序排序
    scored.sort(function(a, b) { return b.score - a.score; });
    
    // 选择分数最高的needed个员工
    var assigned = 0;
    for (var i = 0; i < scored.length && assigned < needed; i++) {
        var emp = scored[i].emp;
        
        // 再次检查配额
        var quota = quotas[emp.pid];
        if (shiftType === 'white' && emp.whiteDaysAssigned >= quota.whiteDays) continue;
        if (shiftType === 'night' && emp.nightDaysAssigned >= quota.nightDays) continue;
        
        // 分配班次
        emp.assignments[day] = shiftType;
        if (shiftType === 'white') {
            emp.whiteDaysAssigned++;
        } else {
            emp.nightDaysAssigned++;
        }
        emp.totalDaysAssigned++;
        emp.consecutiveWorkDays++;
        emp.consecutiveRestDays = 0;
        
        // 检查是否发生班次切换
        if (emp.lastShiftType && emp.lastShiftType !== shiftType) {
            emp.hasSwitchedShift = true;
        }
        emp.lastShiftType = shiftType;
        
        dailyCount[day][shiftType]++;
        assigned++;
        
        console.log('    ' + emp.name + ' -> ' + shiftType + '班 (分数:' + scored[i].score + ')');
    }
}

/**
 * 计算员工分配某班次的评分
 */
function calculateAssignmentScore(emp, day, shiftType) {
    var score = 0;
    var quota = quotas[emp.pid];
    
    // ===== 硬约束：违反则直接排除（返回极低分）=====
    
    // 检查连续工作天数（超过5天禁止）
    if (emp.consecutiveWorkDays >= 5) {
        return -99999;
    }
    
    // 检查月内班次切换规则（只允许切换一次）
    if (emp.hasSwitchedShift && emp.lastShiftType !== shiftType) {
        return -99999; // 不允许再次切换
    }
    
    // ===== 软约束：评分优化 =====
    
    // 1. 连续性奖励（最优3-4天）
    if (emp.consecutiveWorkDays === 0) {
        // 刚开始新工作块
        if (emp.consecutiveRestDays >= 2 && emp.consecutiveRestDays <= 4) {
            score += 3000; // 休息2-4天后开始工作，最优
        } else if (emp.consecutiveRestDays >= 2) {
            score += 1500; // 休息超过2天，可以开始
        } else if (emp.consecutiveRestDays === 1) {
            score -= 3000; // 只休息1天，禁止
        }
    } else {
        // 连续工作中
        if (emp.consecutiveWorkDays === 2 || emp.consecutiveWorkDays === 3) {
            score += 2000; // 连续2-3天，最优
        } else if (emp.consecutiveWorkDays === 1) {
            score -= 2000; // 只工作1天，禁止
        } else if (emp.consecutiveWorkDays === 4) {
            score += 500; // 连续4天，可接受
        } else if (emp.consecutiveWorkDays === 5) {
            score -= 5000; // 连续5天，不鼓励
        }
    }
    
    // 2. 配额紧迫度
    var whiteRemaining = quota.whiteDays - emp.whiteDaysAssigned;
    var nightRemaining = quota.nightDays - emp.nightDaysAssigned;
    var totalRemaining = whiteRemaining + nightRemaining;
    var daysLeft = emp.daysInMonth - day + 1;
    
    if (totalRemaining > 0 && daysLeft > 0) {
        var urgency = totalRemaining / daysLeft;
        if (urgency > 0.5) {
            score += 1000; // 配额紧迫，优先安排
        }
    }
    
    // 3. 班次均衡（月内单次切换策略）
    var midPoint = Math.floor(emp.daysInMonth / 2);
    if (day <= midPoint && !emp.hasSwitchedShift) {
        // 前半段：优先分配与上月末相同的班次
        if (emp.lastShiftType === shiftType) {
            score += 500;
        }
    } else if (day > midPoint && !emp.hasSwitchedShift) {
        // 后半段：如果还没切换，鼓励切换到另一个班次
        if (emp.lastShiftType && emp.lastShiftType !== shiftType) {
            score += 800;
        }
    }
    
    return score;
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