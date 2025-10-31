const { ai } = require('cost-katana');

// Initialize CostKatana
// Example usage
const response = await ai('gpt-4', 'Hello, world!');
console.log(response.text);
console.log(`Cost: ${response.cost}`);

module.exports = { ai };
