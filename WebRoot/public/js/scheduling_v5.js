/**
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

function performDailyScheduling(persons, demands, daysInMonth, month, quotaData, personRestDays) {
    console.log('\n========== 第二层：逐日排班（v5.0） ==========');
    schedulingQuotas = quotaData;
    var employees = persons.map(function(p) {
        return {
            pid: p.pid, name: p.name, assignments: {},
            whiteDaysAssigned: 0, nightDaysAssigned: 0, totalDaysAssigned: 0, restDaysAssigned: 0,
            consecutiveWorkDays: 0, consecutiveRestDays: 0,
            lastShiftType: null, hasSwitchedShift: false, daysInMonth: daysInMonth
        };
    });
    var dailyCount = {};
    for (var d = 1; d <= daysInMonth; d++) dailyCount[d] = {white: 0, night: 0, rest: 0};
    
    employees.forEach(function(emp) {
        (personRestDays[emp.pid] || []).forEach(function(day) {
            if (day >= 1 && day <= daysInMonth) {
                emp.assignments[day] = 'rest';
                emp.restDaysAssigned++;
                emp.consecutiveRestDays++;
                dailyCount[day].rest++;
            }
        });
    });
    
    employees.forEach(function(emp) {
        var prevState = getPreviousMonthState(month, emp.pid);
        if (prevState.lastShift) {
            emp.lastShiftType = prevState.lastShift;
            emp.consecutiveWorkDays = prevState.consecutive || 0;
        } else {
            emp.consecutiveRestDays = prevState.consecutive || 0;
        }
    });
    
    for (var day = 1; day <= daysInMonth; day++) {
        var availableForWhite = [], availableForNight = [];
        employees.forEach(function(emp) {
            if (emp.assignments[day]) return;
            var quota = schedulingQuotas[emp.pid];
            if (!quota) return;
            if (emp.whiteDaysAssigned < quota.whiteDays) availableForWhite.push(emp);
            if (emp.nightDaysAssigned < quota.nightDays) availableForNight.push(emp);
        });
        
        var scoredWhite = availableForWhite.map(function(emp) { return { emp: emp, score: calculateAssignmentScore(emp, day, 'white') }; });
        scoredWhite.sort(function(a, b) { return b.score - a.score; });
        var assignedWhite = 0;
        for (var i = 0; i < scoredWhite.length && assignedWhite < 2; i++) {
            var emp = scoredWhite[i].emp;
            if (emp.whiteDaysAssigned >= schedulingQuotas[emp.pid].whiteDays) continue;
            emp.assignments[day] = 'white';
            emp.whiteDaysAssigned++; emp.totalDaysAssigned++; emp.consecutiveWorkDays++; emp.consecutiveRestDays = 0;
            if (emp.lastShiftType && emp.lastShiftType !== 'white') emp.hasSwitchedShift = true;
            emp.lastShiftType = 'white';
            dailyCount[day].white++; assignedWhite++;
        }
        
        var scoredNight = availableForNight.map(function(emp) { return { emp: emp, score: calculateAssignmentScore(emp, day, 'night') }; });
        scoredNight.sort(function(a, b) { return b.score - a.score; });
        var assignedNight = 0;
        for (var i = 0; i < scoredNight.length && assignedNight < 2; i++) {
            var emp = scoredNight[i].emp;
            if (emp.nightDaysAssigned >= schedulingQuotas[emp.pid].nightDays) continue;
            emp.assignments[day] = 'night';
            emp.nightDaysAssigned++; emp.totalDaysAssigned++; emp.consecutiveWorkDays++; emp.consecutiveRestDays = 0;
            if (emp.lastShiftType && emp.lastShiftType !== 'night') emp.hasSwitchedShift = true;
            emp.lastShiftType = 'night';
            dailyCount[day].night++; assignedNight++;
        }
        
        employees.forEach(function(emp) {
            if (!emp.assignments[day]) {
                emp.assignments[day] = 'rest';
                emp.restDaysAssigned++; emp.consecutiveRestDays++; emp.consecutiveWorkDays = 0; emp.lastShiftType = null;
                dailyCount[day].rest++;
            }
        });
    }
    
    console.log('========== 第二层完成 ==========\n');
    return employees;
}

function calculateAssignmentScore(emp, day, shiftType) {
    var score = 0;
    var quota = schedulingQuotas[emp.pid];
    if (emp.consecutiveWorkDays >= 5) return -99999;
    if (emp.hasSwitchedShift && emp.lastShiftType !== shiftType) return -99999;
    if (emp.consecutiveWorkDays === 0) {
        if (emp.consecutiveRestDays >= 2 && emp.consecutiveRestDays <= 4) score += 3000;
        else if (emp.consecutiveRestDays >= 2) score += 1500;
        else if (emp.consecutiveRestDays === 1) score -= 3000;
    } else {
        if (emp.consecutiveWorkDays === 2 || emp.consecutiveWorkDays === 3) score += 2000;
        else if (emp.consecutiveWorkDays === 1) score -= 2000;
        else if (emp.consecutiveWorkDays === 4) score += 500;
        else if (emp.consecutiveWorkDays === 5) score -= 5000;
    }
    var totalRemaining = (quota.whiteDays - emp.whiteDaysAssigned) + (quota.nightDays - emp.nightDaysAssigned);
    var daysLeft = emp.daysInMonth - day + 1;
    if (totalRemaining > 0 && daysLeft > 0 && totalRemaining / daysLeft > 0.5) score += 1000;
    var midPoint = Math.floor(emp.daysInMonth / 2);
    if (day <= midPoint && !emp.hasSwitchedShift) {
        if (emp.lastShiftType === shiftType) score += 500;
    } else if (day > midPoint && !emp.hasSwitchedShift) {
        if (emp.lastShiftType && emp.lastShiftType !== shiftType) score += 800;
    }
    return score;
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

console.log('✅ v5.0 排班算法模块已加载');