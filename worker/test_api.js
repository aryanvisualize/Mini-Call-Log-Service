

async function testAPI() {
    console.log("1. Testing GET /health");
    let res = await fetch('http://localhost:8787/health');
    console.log("Status:", res.status);
    console.log("Body:", await res.json());

    console.log("\n2. Testing POST /calls with invalid data");
    res = await fetch('http://localhost:8787/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: "not a number" })
    });
    console.log("Status:", res.status);
    console.log("Body:", await res.json());

    console.log("\n3. Testing POST /calls with valid data");
    const testId = `test_call_${Date.now()}`;
    res = await fetch('http://localhost:8787/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id: testId,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            duration: 10,
            transcript: [{ speaker: "user", text: "hello" }],
            metrics: { stt: 100 }
        })
    });
    console.log("Status:", res.status);
    console.log("Body:", await res.json());

    console.log("\n4. Testing GET /calls");
    res = await fetch('http://localhost:8787/calls');
    console.log("Status:", res.status);
    let calls = await res.json();
    console.log("Body size:", calls.length);

    console.log("\n5. Testing GET /calls/:id for the newly created call");
    res = await fetch(`http://localhost:8787/calls/${testId}`);
    console.log("Status:", res.status);
    console.log("Body:", await res.json());

    console.log("\n6. Testing GET /calls/:id for nonexistent call");
    res = await fetch(`http://localhost:8787/calls/does_not_exist_123`);
    console.log("Status:", res.status);
    console.log("Body:", await res.json());
}

testAPI().catch(console.error);
