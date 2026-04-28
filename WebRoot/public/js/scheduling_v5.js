/**更新 v6.0 - 修复月末配额问题
 * 排班算法 v5.0 - 用户需求定制版
 */

// 版本标记
$.ajax({
    url: '/FinalScheduler/ajax/api/log',
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({
        level: 'info',
        message: '排班算法 v6.0 初始化',
        details: '修复内容: 配额计算考虑强制休息日, 确保月末正常排班'
    }),
    async: true
});

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

function calculateMonthlyQuotas(persons, demands, daysInMonth, month, personRestDays) {
    $.ajax({
        url: '/FinalScheduler/ajax/api/log',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            level: 'debug',
            message: '开始执行generateRoster函数'
        }),
        async: true
    });

    // ... (rest of the function remains unchanged)
}

function generateRoster() {
    $.ajax({
        url: '/FinalScheduler/ajax/api/log',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            level: 'info',
            message: '班表生成完成',
            details: '生成月份: ' + $('#schedule_month').val()
        }),
        async: true
    });
}