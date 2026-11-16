import assert from 'node:assert/strict';
import test from 'node:test';
import { InferenceServerOpenAICompatible } from '../js/engine/inference/adapter-openai-compatible.js';

const options = {
    system: 'Analyze the story.',
    contextInfoBefore: 'Before',
    messages: [{ message: 'A character arrives.', author: 'Narrator', storyMaster: false }],
    contextInfoAfter: 'After',
};
const question = (nextQuestion, extra = {}) => ({
    nextQuestion, stopAt: [], stopAfter: [], maxParagraphs: 1,
    maxCharacters: 100, maxSafetyCharacters: 200, ...extra,
});

function fixture() {
    const adapter = new InferenceServerOpenAICompatible({ setInferenceAdapter() {} }, {
        useExperimentalTestMode: true,
    });
    const requests = [];
    adapter.selectedModel = { id: 'test-model', tags: [] };
    adapter.runInference = async (model, messages, sampling, limits) => {
        requests.push(structuredClone({ model, messages, sampling, limits }));
        return { text: `reply ${requests.length}`, thoughts: [], warnings: [] };
    };
    return { adapter, requests };
}

test('follow-ups preserve prior turns and assistant prefill without repeating context', async () => {
    const { adapter, requests } = fixture();
    const agent = adapter.runQuestioningCustomAgentOn('test', options);
    assert.equal((await agent.next()).value.text, 'ready');
    assert.equal(requests.length, 0);
    await agent.next(question('Who arrived?', { answerTrail: 'It was ' }));
    await agent.next(question('Why?', { contextInfo: 'Extra context', instructions: 'Be brief' }));
    assert.deepEqual(requests[1].messages.slice(0, 2), requests[0].messages);
    assert.deepEqual(requests[1].messages[2], {
        role: 'assistant', content: '# Answer:\n\nIt was reply 1',
    });
    assert.deepEqual(requests[1].messages[3], {
        role: 'user', content: 'Extra context\n\n# Question:\n\nWhy?\n\n# Instructions:\n\nBe brief',
    });
    assert.equal((await agent.next(null)).done, true);
    assert.equal(requests.length, 2);
});

test('generators keep independent histories even with the same gear', async () => {
    const { adapter, requests } = fixture();
    const first = adapter.runQuestioningCustomAgentOn('test', options);
    const second = adapter.runQuestioningCustomAgentOn('test', { ...options, system: 'Other agent' });
    await first.next();
    await first.next(question('First question'));
    await second.next();
    await second.next(question('Other question'));
    assert.equal(requests[1].messages.length, 2);
    assert.equal(requests[1].messages[0].content, 'Other agent');
    await first.next(question('Follow-up', { newSession: false }));
    assert.deepEqual(requests[2].messages.slice(0, 2), requests[0].messages);
    assert.equal(requests[2].messages.length, 4);
    await first.next(null);
    await second.next(null);
    const third = adapter.runQuestioningCustomAgentOn('test', options);
    await third.next();
    await third.next(question('New generator'));
    assert.equal(requests[3].messages.length, 2);
    await third.return();
});

test('a question can reset history, with following questions continuing the fresh session', async () => {
    const { adapter, requests } = fixture();
    const agent = adapter.runQuestioningCustomAgentOn('test', options);
    await agent.next();
    await agent.next(question('Old question'));
    await agent.next(question('Old follow-up'));
    await agent.next(question('Fresh question', { newSession: true }));
    assert.equal(requests[2].messages.length, 2);
    assert.deepEqual(requests[2].messages[0], requests[0].messages[0]);
    assert.equal(requests[2].messages[1].content,
        requests[0].messages[1].content.replace('Old question', 'Fresh question'));
    await agent.next(question('Fresh follow-up'));
    assert.equal(requests[3].messages.length, 4);
    assert.deepEqual(requests[3].messages.slice(0, 2), requests[2].messages);
    assert.equal(requests[3].messages[2].content, '# Answer:\n\nreply 3');
    await agent.next(question('Reset again', { newSession: true }));
    assert.equal(requests[4].messages.length, 2);
    await agent.return();
});
