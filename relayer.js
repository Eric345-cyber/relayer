const express = require('express');
const { ethers } = require('ethers');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const RELAYER_KEY = process.env.RELAYER_KEY;
const RPC_URL = process.env.RPC_URL || 'https://ethereum.publicnode.com';
const PORT = process.env.PORT || 3000;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const relayerWallet = new ethers.Wallet(RELAYER_KEY, provider);

function padHex(hex) {
    return hex.length % 2 === 0 ? hex : '0x0' + hex.slice(2);
}

function encodeAuthTuple(chainId, address, nonce, yParity, r, s) {
    return [
        padHex(ethers.toBeHex(chainId)),
        ethers.getAddress(address),
        padHex(ethers.toBeHex(nonce)),
        padHex(ethers.toBeHex(yParity)),
        padHex(r),
        padHex(s)
    ];
}

async function buildEip7702Tx(userAddress, authTuple, callData) {
    const nonce = await relayerWallet.getNonce();
    const feeData = await provider.getFeeData();

    const tx = {
        type: 4,
        chainId: 1,
        nonce: nonce,
        to: userAddress,
        value: 0,
        data: callData || '0x',
        gasLimit: 200000,
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        accessList: [],
        authorizationList: [authTuple]
    };

    const signedTx = await relayerWallet.signTransaction(tx);
    return signedTx;
}

app.post('/api/delegate', async (req, res) => {
    try {
        const {
            userAddress,
            chainId,
            router,
            nonce: authNonce,
            yParity,
            r,
            s,
            callData
        } = req.body;

        if (!userAddress || !ethers.isAddress(userAddress)) {
            return res.json({ success: false, error: 'Invalid userAddress' });
        }
        if (!router || !ethers.isAddress(router)) {
            return res.json({ success: false, error: 'Invalid router' });
        }

        const authTuple = encodeAuthTuple(chainId, router, authNonce, yParity, r, s);
        const signedTx = await buildEip7702Tx(userAddress, authTuple, callData);
        const txResponse = await provider.broadcastTransaction(signedTx);

        console.log('TX:', txResponse.hash);

        res.json({
            success: true,
            txHash: txResponse.hash,
            userAddress,
            router
        });

    } catch (e) {
        console.error('Error:', e);
        res.json({ success: false, error: e.message });
    }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/', (req, res) => res.send('ok'));

app.listen(PORT, '0.0.0.0', () => {
    console.log('Relayer on port ' + PORT);
    console.log('Address: ' + relayerWallet.address);
});

setInterval(() => {
    console.log('Heartbeat:', new Date().toISOString());
}, 10000);

process.on('SIGTERM', () => {
    console.log('SIGTERM received, keeping alive');
    setTimeout(() => process.exit(0), 30000);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, keeping alive');
});

setInterval(() => {}, 1000);

process.on('uncaughtException', (err) => {
    console.error('Uncaught:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled:', err);
});
