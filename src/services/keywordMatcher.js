class KeywordMatcher {
    constructor() {
        this.keywords = new Map();
        this.regexPatterns = new Map();
    }

    // Register a keyword with its flow
    registerKeyword(keyword, flowName, options = {}) {
        const config = {
            matchType: options.matchType || 'contains', // 'exact', 'contains', 'regex'
            caseSensitive: options.caseSensitive || false,
            priority: options.priority || 0
        };

        if (config.matchType === 'regex') {
            this.regexPatterns.set(flowName, {
                pattern: new RegExp(keyword, config.caseSensitive ? '' : 'i'),
                priority: config.priority
            });
        } else {
            const key = config.caseSensitive ? keyword : keyword.toLowerCase();
            
            if (!this.keywords.has(key)) {
                this.keywords.set(key, []);
            }
            
            this.keywords.get(key).push({
                flowName,
                matchType: config.matchType,
                priority: config.priority
            });
        }
    }

    // Match incoming message against keywords
    match(message) {
        const matches = [];
        const processedMessage = message.toLowerCase().trim();

        // Check exact and contains matches
        for (const [keyword, flows] of this.keywords.entries()) {
            for (const flow of flows) {
                let isMatch = false;

                if (flow.matchType === 'exact') {
                    isMatch = processedMessage === keyword;
                } else if (flow.matchType === 'contains') {
                    isMatch = processedMessage.includes(keyword);
                }

                if (isMatch) {
                    matches.push({
                        flowName: flow.flowName,
                        keyword: keyword,
                        priority: flow.priority,
                        matchType: flow.matchType
                    });
                }
            }
        }

        // Check regex patterns
        for (const [flowName, config] of this.regexPatterns.entries()) {
            if (config.pattern.test(message)) {
                matches.push({
                    flowName,
                    keyword: 'regex',
                    priority: config.priority,
                    matchType: 'regex'
                });
            }
        }

        // Sort by priority (highest first)
        matches.sort((a, b) => b.priority - a.priority);

        return matches.length > 0 ? matches[0] : null;
    }

    // Load keywords from database
    async loadFromDatabase(db) {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM flows WHERE is_active = 1', (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }

                for (const flow of rows) {
                    const keywords = JSON.parse(flow.trigger_keywords);
                    
                    for (const keywordConfig of keywords) {
                        this.registerKeyword(
                            keywordConfig.keyword,
                            flow.name,
                            keywordConfig.options || {}
                        );
                    }
                }

                console.log(`Loaded ${rows.length} flows with keywords`);
                resolve();
            });
        });
    }
}

module.exports = KeywordMatcher;