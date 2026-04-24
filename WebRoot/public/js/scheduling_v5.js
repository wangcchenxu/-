/**更新
 * 排班算法 v5.0 - 用户需求定制版
 */

function getCrossMonthMemory() {
    var memory = JSON.parse(localStorage.getItem('cross_month_memory') || '{}');
    if (!memory.lastOddMonthExtraWorkers) memory.lastOddMonthExtraWorkers = [];
    if (!memory.shiftBalances) memory.shiftBalances = {};
    if (!memory.lastMonthEndStates) memory.lastMonthEndStates = {};
    return memory;
}

function saveCrossMonthMemory(memoryData) {
    localStorage.setItem('cross_month_memory', JSON.stringify(memoryData));
}

var schedulingQuotas = {};

function calculateMonthlyQuotas(persons, demands, daysInMonth, month) {
    console.log('\n========== 第一层：月度配额计算 ==========');
    var quotaResult = {};
    var isOddMonth = (daysInMonth % 2 !== 0);
    var memoryData = getCrossMonthMemory();
    var lastOddMonthExtraWorkers = memoryData.lastOddMonthExtraWorkers || [];
    var shiftBalances = memoryData.shiftBalances || {};
    
    console.log('本月天数: ' + daysInMonth + (isOddMonth ? ' (奇数)' : ' (偶数)'));
    
    if (!isOddMonth) {
        var workDays = daysInMonth / 2;
        console.log('偶数天，每人上班 ' + workDays + ' 天');
        persons.forEach(function(p) {
            quotaResult[p.pid] = { totalWorkDays: workDays, whiteDays: 0, nightDays: 0, restDays: daysInMonth - workDays };
        });
    } else {
        var workDaysMore = Math.ceil(daysInMonth / 2);
        var workDaysLess = Math.floor(daysInMonth / 2);
        var allPids = persons.map(function(p) { return p.pid; });
        var notExtraLastMonth = allPids.filter(function(pid) { return lastOddMonthExtraWorkers.indexOf(pid) === -1; });
        var extraWorkers = notExtraLastMonth.length >= 4 ? notExtraLastMonth.slice(0, 4) : allPids.slice(0, 4);
        console.log('奇数天，以下4人多上1天 (' + workDaysMore + '天): ' + extraWorkers.join(', '));
        persons.forEach(function(p) {
            var workDays = extraWorkers.indexOf(p.pid) !== -1 ? workDaysMore : workDaysLess;
            quotaResult[p.pid] = { totalWorkDays: workDays, whiteDays: 0, nightDays: 0, restDays: daysInMonth - workDays };
        });
        memoryData.lastOddMonthExtraWorkers = extraWorkers;
    }
    
    persons.forEach(function(p) {
        var quota = quotaResult[p.pid];
        var W = quota.totalWorkDays;
        if (W % 2 === 0) {
            quota.whiteDays = W / 2;
            quota.nightDays = W / 2;
        } else {
            var balance = shiftBalances[p.pid] || 0;
            if (balance > 0) { quota.nightDays = Math.ceil(W / 2); quota.whiteDays = Math.floor(W / 2); }
            else if (balance < 0) { quota.whiteDays = Math.ceil(W / 2); quota.nightDays = Math.floor(W / 2); }
            else {
                var personIndex = persons.indexOf(p);
                if (personIndex % 2 === 0) { quota.whiteDays = Math.ceil(W / 2); quota.nightDays = Math.floor(W / 2); }
                else { quota.nightDays = Math.ceil(W / 2); quota.whiteDays = Math.floor(W / 2); }
            }
            shiftBalances[p.pid] = quota.whiteDays - quota.nightDays;
        }
        console.log(p.name + ': 上班' + W + '天，白班' + quota.whiteDays + '天，夜班' + quota.nightDays + '天');
    });
    
    memoryData.shiftBalances = shiftBalances;
    saveCrossMonthMemory(memoryData);
    schedulingQuotas = quotaResult;
    console.log('月度配额计算完成');
    return quotaResult;
}

/**
 * 第二层：逐日排班 - 全局协调版
 * 核心策略：每天从可用人员池中选择最合适的人，确保每日2白2夜
 */
function performDailyScheduling(persons, demands, daysInMonth, month, quotaData, personRestDays) {
    console.log('\n========== 第二层：逐日排班（全局协调版） ==========');
    
    // 更新全局quotas变量
    schedulingQuotas = quotaData;
    
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
            // 块模式跟踪
            workBlock1Remaining: Math.floor(quotaData[p.pid].totalWorkDays / 2),
            restBetweenBlocks: Math.max(3, Math.min(4, Math.floor((daysInMonth - quotaData[p.pid].totalWorkDays) / 2))),
            workBlock2Remaining: quotaData[p.pid].totalWorkDays - Math.floor(quotaData[p.pid].totalWorkDays / 2),
            currentPhase: 1, // 1=工作块1, 2=休息, 3=工作块2
            block1ShiftType: null // 记录工作块1的班次类型
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
                emp.assignments[day] = 'forced_rest';
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
            emp.block1ShiftType = prevState.lastShift;
            console.log('  ' + emp.name + ': 上月末连续' + emp.lastShiftType + '班' + emp.consecutiveWorkDays + '天');
        } else {
            emp.consecutiveRestDays = prevState.consecutive || 0;
            console.log('  ' + emp.name + ': 上月末连续休息' + emp.consecutiveRestDays + '天');
        }
    });
    
    // 步骤3: 逐日分配 - 全局协调
    console.log('[步骤3] 逐日全局协调分配...');
    for (var day = 1; day <= daysInMonth; day++) {
        console.log('\n--- 第' + day + '天 ---');
        
        // 跳过强制休息日
        var alreadyAssigned = employees.filter(function(emp) {
            return emp.assignments[day] === 'forced_rest';
        });
        
        // 收集可以上班的候选人
        var candidatesForWhite = [];
        var candidatesForNight = [];
        
        employees.forEach(function(emp) {
            if (emp.assignments[day]) return; // 已经安排了
            
            var quota = schedulingQuotas[emp.pid];
            
            // 检查是否可以上白班
            if (emp.whiteDaysAssigned < quota.whiteDays && canWorkToday(emp, day, 'white')) {
                candidatesForWhite.push(emp);
            }
            
            // 检查是否可以上夜班
            if (emp.nightDaysAssigned < quota.nightDays && canWorkToday(emp, day, 'night')) {
                candidatesForNight.push(emp);
            }
        });
        
        console.log('  候选白班: ' + candidatesForWhite.length + '人, 候选夜班: ' + candidatesForNight.length + '人');
        
        // 选择2人上白班
        selectBestCandidates(day, candidatesForWhite, employees, 'white', 2, dailyCount);
        
        // 选择2人上夜班（排除已选白班的）
        var remainingForNight = candidatesForNight.filter(function(emp) {
            return !emp.assignments[day];
        });
        selectBestCandidates(day, remainingForNight, employees, 'night', 2, dailyCount);
        
        // 其余人标记为休息
        employees.forEach(function(emp) {
            if (!emp.assignments[day]) {
                emp.assignments[day] = 'rest';
                emp.restDaysAssigned++;
                emp.consecutiveRestDays++;
                emp.consecutiveWorkDays = 0;
                dailyCount[day].rest++;
            }
        });
        
        console.log('  第' + day + '天结果: 白班' + dailyCount[day].white + '人, 夜班' + dailyCount[day].night + '人, 休息' + dailyCount[day].rest + '人');
        
        // 验证每日配置
        if (dailyCount[day].white !== 2 || dailyCount[day].night !== 2) {
            console.warn('  ⚠ 第' + day + '天不满足2白2夜！');
        }
    }
    
    console.log('\n========== 第二层完成 ==========\n');
    return employees;
}

/**
 * 判断员工今天是否可以上某个班次
 * 注意：这里只检查绝对硬约束，软约束交给评分函数处理
 */
function canWorkToday(emp, day, shiftType) {
    var quota = schedulingQuotas[emp.pid];
    var daysLeft = emp.daysInMonth - day + 1;
    var totalRemaining = (quota.whiteDays - emp.whiteDaysAssigned) + (quota.nightDays - emp.nightDaysAssigned);
    
    // 硬约束1：连续工作不能超过6天（绝对禁止，月末紧急情况下允许到6天）
    if (emp.consecutiveWorkDays >= 6) {
        return false;
    }
    
    // 硬约束2：月内只允许切换一次班次（绝对禁止）
    if (emp.hasSwitchedShift && emp.lastShiftType !== shiftType) {
        return false;
    }
    
    // 硬约束3：配额检查（绝对禁止）
    if (shiftType === 'white' && emp.whiteDaysAssigned >= quota.whiteDays) {
        return false;
    }
    if (shiftType === 'night' && emp.nightDaysAssigned >= quota.nightDays) {
        return false;
    }
    
    // 注意：以下约束已交给评分函数处理
    // - 连续性约束（通过高额正负分实现）
    // - 休息天数约束（通过高额正负分实现）
    // 这样可以确保算法有足够灵活性，同时通过评分引导合理模式
    
    return true;
}

/**
 * 从候选人中选择最优的几个
 */
function selectBestCandidates(day, candidates, allEmployees, shiftType, needed, dailyCount) {
    if (candidates.length === 0 || needed === 0) return;
    
    // 评分
    var scored = candidates.map(function(emp) {
        return {
            emp: emp,
            score: calculateAssignmentScore(emp, day, shiftType)
        };
    });
    
    // 排序
    scored.sort(function(a, b) { return b.score - a.score; });
    
    // 选择前needed个
    var assigned = 0;
    for (var i = 0; i < scored.length && assigned < needed; i++) {
        var emp = scored[i].emp;
        var quota = schedulingQuotas[emp.pid];
        
        // 最终检查
        if (shiftType === 'white' && emp.whiteDaysAssigned >= quota.whiteDays) continue;
        if (shiftType === 'night' && emp.nightDaysAssigned >= quota.nightDays) continue;
        
        // 分配
        emp.assignments[day] = shiftType;
        if (shiftType === 'white') {
            emp.whiteDaysAssigned++;
        } else {
            emp.nightDaysAssigned++;
        }
        emp.totalDaysAssigned++;
        emp.consecutiveWorkDays++;
        emp.consecutiveRestDays = 0;
        
        // 记录工作块1的班次类型
        if (!emp.block1ShiftType) {
            emp.block1ShiftType = shiftType;
        }
        
        // 检查班次切换
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
 * 决定工作块1的班次类型
 */
function determineFirstBlockShift(emp, day) {
    var quota = schedulingQuotas[emp.pid];
    
    // 如果有上月末的班次，优先延续
    if (emp.lastShiftType) {
        if (emp.lastShiftType === 'white' && emp.whiteDaysAssigned < quota.whiteDays) {
            return 'white';
        } else if (emp.lastShiftType === 'night' && emp.nightDaysAssigned < quota.nightDays) {
            return 'night';
        }
    }
    
    // 根据配额决定：哪个班次剩余多就用哪个
    var whiteRemaining = quota.whiteDays - emp.whiteDaysAssigned;
    var nightRemaining = quota.nightDays - emp.nightDaysAssigned;
    
    if (whiteRemaining > nightRemaining) {
        return 'white';
    } else if (nightRemaining > whiteRemaining) {
        return 'night';
    } else {
        // 相等时，前半月上白班，后半月上夜班
        var midPoint = Math.floor(emp.daysInMonth / 2);
        return day <= midPoint ? 'white' : 'night';
    }
}

/**
 * 生成块序列：每人2个工作块 + 中间休息
 */
function generateBlockSequence(emp, quota, daysInMonth, month) {
    var blocks = [];
    var totalWork = quota.totalWorkDays;
    
    // 第一个工作块
    var work1Days = Math.floor(totalWork / 2);
    if (work1Days > 0) {
        blocks.push({
            type: 'work',
            days: work1Days,
            currentDay: 0,
            shiftType: null
        });
    }
    
    // 休息块
    var restDays = Math.max(3, Math.min(4, Math.floor((daysInMonth - totalWork) / 2)));
    blocks.push({
        type: 'rest',
        days: restDays,
        currentDay: 0
    });
    
    // 第二个工作块
    var work2Days = totalWork - work1Days;
    if (work2Days > 0) {
        blocks.push({
            type: 'work',
            days: work2Days,
            currentDay: 0,
            shiftType: null
        });
    }
    
    return blocks;
}

/**
 * 决定工作块的班次类型
 */
function determineShiftForBlock(emp, block, day) {
    var quota = schedulingQuotas[emp.pid];
    
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
    var maxIterations = 100;
    var iteration = 0;
    
    while (iteration < maxIterations) {
        var hasChanges = false;
        
        for (var day = 1; day <= daysInMonth; day++) {
            var whiteCount = dailyCount[day].white;
            var nightCount = dailyCount[day].night;
            
            if (whiteCount === 2 && nightCount === 2) continue;
            
            // 找出当天上班和休息的员工
            var whiteWorkers = [];
            var nightWorkers = [];
            var restWorkers = [];
            
            employees.forEach(function(emp) {
                if (emp.assignments[day] === 'white') whiteWorkers.push(emp);
                else if (emp.assignments[day] === 'night') nightWorkers.push(emp);
                else if (emp.assignments[day] === 'rest') restWorkers.push(emp);
            });
            
            // 白班多了，夜班少了
            if (whiteCount > 2 && nightCount < 2 && nightWorkers.length < 2) {
                for (var i = 0; i < whiteWorkers.length && nightCount < 2; i++) {
                    var emp = whiteWorkers[i];
                    var quota = schedulingQuotas[emp.pid];
                    if (emp.nightDaysAssigned < quota.nightDays) {
                        emp.assignments[day] = 'night';
                        emp.whiteDaysAssigned--;
                        emp.nightDaysAssigned++;
                        dailyCount[day].white--;
                        dailyCount[day].night++;
                        emp.lastShiftType = 'night';
                        hasChanges = true;
                        console.log('  第' + day + '天: ' + emp.name + ' 白班->夜班');
                        break;
                    }
                }
            } 
            // 夜班多了，白班少了
            else if (nightCount > 2 && whiteCount < 2 && whiteWorkers.length < 2) {
                for (var i = 0; i < nightWorkers.length && whiteCount < 2; i++) {
                    var emp = nightWorkers[i];
                    var quota = schedulingQuotas[emp.pid];
                    if (emp.whiteDaysAssigned < quota.whiteDays) {
                        emp.assignments[day] = 'white';
                        emp.nightDaysAssigned--;
                        emp.whiteDaysAssigned++;
                        dailyCount[day].night--;
                        dailyCount[day].white++;
                        emp.lastShiftType = 'white';
                        hasChanges = true;
                        console.log('  第' + day + '天: ' + emp.name + ' 夜班->白班');
                        break;
                    }
                }
            }
        }
        
        if (!hasChanges) break;
        iteration++;
    }
    
    console.log('全局调整完成，迭代' + iteration + '次');
}

function getPreviousMonthState(currentMonth, pid) {
    var parts = currentMonth.split('-');
    var year = parseInt(parts[0]), month = parseInt(parts[1]);
    var prevMonth = month - 1, prevYear = year;
    if (prevMonth === 0) { prevMonth = 12; prevYear = year - 1; }
    var prevMonthStr = prevYear + '-' + (prevMonth < 10 ? '0' + prevMonth : prevMonth);
    var historyData = JSON.parse(localStorage.getItem('schedule_history') || '{}');
    var prevMonthData = historyData[prevMonthStr];
    if (!prevMonthData || !prevMonthData.assignments || !prevMonthData.assignments[pid]) return { lastShift: null, consecutive: 0 };
    var assignments = prevMonthData.assignments[pid];
    var prevMonthDays = new Date(year, month, 0).getDate();
    var lastShift = null, consecutive = 0;
    for (var day = prevMonthDays; day >= 1; day--) {
        var shift = assignments[day];
        if (!shift || shift === 'rest') { if (lastShift) break; continue; }
        if (!lastShift) { lastShift = shift; consecutive = 1; }
        else if (shift === lastShift) consecutive++;
        else break;
    }
    return { lastShift: lastShift, consecutive: consecutive };
}

function updateMemoryAndStatistics(employees, month, daysInMonth) {
    console.log('\n========== 第三层：统计与记忆更新 ==========');
    employees.forEach(function(emp) {
        console.log(emp.name + ': 白班' + emp.whiteDaysAssigned + '天, 夜班' + emp.nightDaysAssigned + '天, 休息' + emp.restDaysAssigned + '天');
    });
    var allValid = true;
    for (var day = 1; day <= daysInMonth; day++) {
        var whiteCount = 0, nightCount = 0;
        employees.forEach(function(emp) {
            if (emp.assignments[day] === 'white') whiteCount++;
            if (emp.assignments[day] === 'night') nightCount++;
        });
        if (whiteCount !== 2 || nightCount !== 2) { console.log('❌ 第' + day + '天不满足2白2夜'); allValid = false; }
    }
    if (allValid) console.log('✓ 所有日期都满足2白2夜配置');
    console.log('========== 统计与记忆更新完成 ==========\n');
}

function validateRoster(roster, rules) {
    console.log('\n========== 班表验证 ==========');
    var employees = roster.persons, daysInMonth = roster.daysInMonth;
    var dailyIssues = [];
    for (var day = 1; day <= daysInMonth; day++) {
        var whiteCount = 0, nightCount = 0;
        employees.forEach(function(emp) {
            if (emp.assignments[day] === 'white') whiteCount++;
            if (emp.assignments[day] === 'night') nightCount++;
        });
        if (whiteCount !== 2 || nightCount !== 2) dailyIssues.push('第' + day + '天: 白班' + whiteCount + '人, 夜班' + nightCount + '人');
    }
    if (dailyIssues.length > 0) {
        console.error('❌ 每日配置验证失败：');
        dailyIssues.forEach(function(issue) { console.error('  ' + issue); });
    } else {
        console.log('✓ 每日配置验证通过：所有日期都满足2白2夜');
    }
    console.log('========== 班表验证完成 ==========\n');
}

function calculateAssignmentScore(emp, day, shiftType) {
    var score = 0;
    var quota = schedulingQuotas[emp.pid];
    var daysLeft = emp.daysInMonth - day + 1;
    
    // ===== 第零优先级：月末紧急模式（唯一保留的进度控制） =====
    var totalRemaining = (quota.whiteDays - emp.whiteDaysAssigned) + (quota.nightDays - emp.nightDaysAssigned);
    
    // 只有在月末紧急情况下才启用进度控制
    // 判断标准：剩余天数 < 剩余配额，说明必须上班
    if (daysLeft <= totalRemaining && daysLeft <= 10) {
        score += 8000; // 极高优先级，确保月末配额完成
    }
    
    // ===== 第一优先级：配额紧迫度（温和调节） =====
    var whiteRemaining = quota.whiteDays - emp.whiteDaysAssigned;
    var nightRemaining = quota.nightDays - emp.nightDaysAssigned;
    
    if (totalRemaining > 0 && daysLeft > 0) {
        var urgency = totalRemaining / daysLeft;
        score += urgency * 1000; // 降低权重，避免过于激进
        
        if (shiftType === 'white' && whiteRemaining > 0) {
            score += (whiteRemaining / daysLeft) * 500;
        }
        if (shiftType === 'night' && nightRemaining > 0) {
            score += (nightRemaining / daysLeft) * 500;
        }
    }
    
    // ===== 第二优先级：连续性约束（最重要） =====
    if (emp.consecutiveWorkDays === 0) {
        // 刚开始新工作块
        if (emp.consecutiveRestDays >= 3 && emp.consecutiveRestDays <= 4) {
            score += 2000; // 休息3-4天后开始工作，强烈鼓励
        } else if (emp.consecutiveRestDays >= 2) {
            score += 1000; // 休息2天，鼓励
        } else if (emp.consecutiveRestDays === 1) {
            score -= 5000; // 只休息1天，强烈不鼓励
        } else if (emp.consecutiveRestDays === 0) {
            score -= 8000; // 刚下班就上班，极不鼓励
        }
    } else {
        // 连续工作中
        if (emp.consecutiveWorkDays === 2 || emp.consecutiveWorkDays === 3) {
            score += 1500; // 连续2-3天，最优，强烈鼓励
        } else if (emp.consecutiveWorkDays === 4) {
            score += 500; // 连续4天，可接受
        } else if (emp.consecutiveWorkDays === 1) {
            score -= 3000; // 只工作1天，不鼓励
        } else if (emp.consecutiveWorkDays >= 5) {
            score -= 8000; // 连续5天以上，强烈惩罚
        }
    }
    
    // ===== 第三优先级：班次切换策略 =====
    var midPoint = Math.floor(emp.daysInMonth / 2);
    
    if (!emp.hasSwitchedShift) {
        // 还未切换过班次
        if (day <= midPoint) {
            // 前半段：优先分配与上月末相同的班次，或白班
            if (emp.lastShiftType === shiftType) {
                score += 300;
            }
            if (shiftType === 'white' && !emp.lastShiftType) {
                score += 200; // 没有历史记录时优先白班
            }
        } else {
            // 后半段：鼓励切换到另一个班次
            if (emp.lastShiftType && emp.lastShiftType !== shiftType) {
                score += 600; // 鼓励切换
            }
        }
    } else {
        // 已经切换过，只能继续当前班次
        if (emp.lastShiftType === shiftType) {
            score += 800; // 必须匹配
        } else {
            score -= 5000; // 不允许再次切换
        }
    }
    
    // ===== 第四优先级：均衡性微调（错开切换时间） =====
    if (!emp.hasSwitchedShift && day > midPoint - 5 && day < midPoint + 5) {
        // 在中点附近，根据员工索引错开切换时间
        var pidStr = String(emp.pid);
        var empIndex = parseInt(pidStr.replace(/\D/g, '')) || 0;
        var idealSwitchDay = midPoint + (empIndex % 6) - 3;
        
        if (day >= idealSwitchDay && shiftType !== emp.lastShiftType) {
            score += 150; // 鼓励在这个时间窗口切换
        }
    }
    
    return score;
}

console.log('✅ v5.0 排班算法模块已加载');