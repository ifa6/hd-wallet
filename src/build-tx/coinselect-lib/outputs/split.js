const utils = require('../utils');

function filterCoinbase(utxos, minConfCoinbase) {
    return utxos.filter(function (utxo) {
        if (utxo.coinbase) {
            return utxo.confirmations >= minConfCoinbase;
        }
        return true;
    });
}

// split utxos between each output, ignores outputs with .value defined
module.exports = function split(utxos, outputs, feeRate, options) {
    const inputLength = options.inputLength;
    const changeOutputLength = options.changeOutputLength;
    const explicitDustThreshold = options.dustThreshold;
    const coinbase = options.coinbase || 100;

    if (!isFinite(utils.uintOrNaN(feeRate))) return {};

    utxos = filterCoinbase(utxos, coinbase);

    const bytesAccum = utils.transactionBytes(utxos, outputs);
    const fee = feeRate * bytesAccum;
    if (outputs.length === 0) return { fee: fee };

    const inAccum = utils.sumOrNaN(utxos);
    const outAccum = utils.sumForgiving(outputs);
    const remaining = inAccum - outAccum - fee;
    if (!isFinite(remaining) || remaining < 0) return { fee: fee };

    const unspecified = outputs.reduce(function (a, x) {
        return a + !isFinite(x.value);
    }, 0);

    if (remaining === 0 && unspecified === 0) return utils.finalize(utxos, outputs, feeRate, inputLength, changeOutputLength);

    const splitOutputsCount = outputs.reduce(function (a, x) {
        return a + !isFinite(x.value);
    }, 0);
    const splitValue = Math.floor(remaining / splitOutputsCount);

    // ensure every output is either user defined, or over the threshold
    if (!outputs.every(function (x) {
        return x.value !== undefined || (splitValue > utils.dustThreshold(feeRate, inputLength, changeOutputLength, explicitDustThreshold));
    })) return { fee: fee };

    // assign splitValue to outputs not user defined
    outputs = outputs.map(function (x) {
        if (x.value !== undefined) return x;

        // not user defined, but still copy over any non-value fields
        const y = {};
        for (const k in x) y[k] = x[k];
        y.value = splitValue;
        return y;
    });

    return utils.finalize(utxos, outputs, feeRate, inputLength, changeOutputLength, explicitDustThreshold);
};
