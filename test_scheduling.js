// test_scheduling.js - 排班算法基础测试用例
// 请根据实际需求补充更多测试场景

const { calculateMonthlyQuotas, performDailyScheduling, adjustDailyConfigurationSimple } = require('./schedulingAlgorithm_v5');

// 测试用例：验证月度配额计算
function testMonthlyQuotas() {
    const persons = [
        { pid: 'P001', name: '张三' },
        { pid: 'P002', name: '李四' },
        { pid: 'P003', name: '王五' },
        { pid: 'P004', name: '赵六' }
    ];
    
    const demands = [
        { pid: 'P001', restDays: [5, 15], workDays: [1, 2, 3], preferStartShift: 'white' },
        { pid: 'P002', restDays: [10, 20], workDays: [4, 5, 6], preferStartShift: 'night' }
    ];
    
    const quotas = calculateMonthlyQuotas(persons, demands, 30, '2023-04');
    console.log('=== 月度配额测试结果 ===');
    console.log(JSON.stringify(quotas, null, 2));
}

// 测试用例：验证每日排班逻辑
function testDailyScheduling() {
    const persons = [
        { pid: 'P001', name: '张三' },
        { pid: 'P002', name: '李四' },
        { pid: 'P003', name: '王五' },
        { pid: 'P004', name: '赵六' }
    ];
    
    const demands = [
        { pid: 'P001', restDays: [5, 15], workDays: [1, 2, 3], preferStartShift: 'white' },
        { pid: 'P002', restDays: [10, 20], workDays: [4, 5, 6], preferStartShift: 'night' }
    ];
    
    const monthlyQuotas = calculateMonthlyQuotas(persons, demands, 30, '2023-04');
    const result = performDailyScheduling(persons, 30, demands, monthlyQuotas);
    
    console.log('=== 每日排班测试结果 ===');
    console.log(`每日配置验证: ${result.dailyCount}`);
    console.log(`员工排班详情: ${JSON.stringify(result.employees, null, 2)}`);
}

// 运行所有测试
function runTests() {
    console.log('=== 开始运行测试 ===');
    testMonthlyQuotas();
    testDailyScheduling();
    console.log('=== 测试结束 ===');
}

runTests();