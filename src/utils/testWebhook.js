const axios = require('axios');

async function testWebhook() {
    const baseUrl = 'http://localhost:3000';
    
    console.log('Testing webhook endpoints...\n');
    
    // Test 1: Send a message that triggers keyword match
    console.log('Test 1: Keyword match (demo)');
    const response1 = await axios.post(`${baseUrl}/webhook/test`, {
        userId: 'test-user-123',
        message: 'I want a demo'
    });
    console.log('Response:', response1.status, '\n');
    
    // Test 2: Continue the flow
    console.log('Test 2: Continue flow (answer industry)');
    const response2 = await axios.post(`${baseUrl}/webhook/test`, {
        userId: 'test-user-123',
        message: 'Technology'
    });
    console.log('Response:', response2.status, '\n');
    
    // Test 3: Continue flow (company size)
    console.log('Test 3: Continue flow (select company size)');
    const response3 = await axios.post(`${baseUrl}/webhook/test`, {
        userId: 'test-user-123',
        message: '1-10'
    });
    console.log('Response:', response3.status, '\n');
    
    console.log('All tests completed!');
}

testWebhook().catch(console.error);