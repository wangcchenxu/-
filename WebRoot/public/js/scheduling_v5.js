// ===== 3.0 月度配额计算 =====
function calculateMonthlyQuotas(persons, demands, daysInMonth, month, personRestDays) {
    // 计算月度配额的简单实现
    var quotas = {};
    
    // 默认配额规则：每人每月15个工作日
    var defaultWorkDays = 15;
    
    // 计算每个员工的配额
    persons.forEach(function(person) {
        var pid = person.pid;
        var demand = demands.find(function(d) { return d.pid === pid; });
        
        // 优先使用需求中的工作天数，否则使用默认值
        var workDays = demand ? parseInt(demand.workDays) : defaultWorkDays;
        
        // 考虑休息日调整
        var restDays = personRestDays[pid] || [];
        var availableDays = daysInMonth - restDays.length;
        
        // 计算实际可用天数
        var actualWorkDays = Math.min(workDays, availableDays);
        
        quotas[pid] = {
            requested: workDays,
            available: availableDays,
            assigned: actualWorkDays
        };
    });
    
    return quotas;
}