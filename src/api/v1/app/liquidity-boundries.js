const log = require('@src/handler/log')('app:liqbounds')

module.exports = async (req, res) => {
  const issuer = req.params.issuer || ''
  const iou = req.params.iou || ''

  const defaultOptions = {
    rates: 'to',
    minOfferCount: 3,
    maxSpreadPercentage: 3,
    maxSlippagePercentage: 4,
    maxSlippagePercentageReverse: 5,
    maxBookLines: 500
  }

  const specificOptions = {
    rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq: { // Gatehub
      _options: {
        minOfferCount: 10,
        maxSpreadPercentage: 4
      },
      USD: {
        maxSlippagePercentage: 2,
        maxSlippagePercentageReverse: 3
      },
      EUR: {
        maxSlippagePercentage: 2,
        maxSlippagePercentageReverse: 5
      }
    },
    rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B: { // Bitstamp
      _options: {},
      USD: {},
      BTC: {}
    },
    rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz: { // Sologenic
      '534F4C4F00000000000000000000000000000000': {        
      }
    },
  }

  const issuerOptions = typeof specificOptions[issuer] !== 'undefined'
    && typeof specificOptions[issuer]._options !== 'undefined'
    ? specificOptions[issuer]._options
    : {}

  const issuerIouOptions = typeof specificOptions[issuer] !== 'undefined'
    && typeof specificOptions[issuer][iou.toUpperCase()] !== 'undefined'
    ? specificOptions[issuer][iou.toUpperCase()]
    : {}

  try {
    res.json({
      issuer,
      iou,
      options: {
        ...defaultOptions,
        ...issuerOptions,
        ...issuerIouOptions
      }
    })
    // } else {
    //   const e = new Error(`Couldn't fetch IOU's`)
    //   e.code = 500
    //   throw e
    // }    
  } catch (e) {
    res.handleError(e)
  }
}
