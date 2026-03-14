var rn_bridge = require('rn-bridge');

// 告诉 React Native 端：Node 已经准备好了，但我是个空壳
rn_bridge.channel.on('message', (msg) => {
    if (msg === 'CHECK_STATUS') {
        rn_bridge.channel.send('NEED_UPDATE'); 
    }
});

rn_bridge.channel.send('NODE_STARTED_PLACEHOLDER');
