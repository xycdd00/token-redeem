const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

// 重要：用于解析JSON请求体
app.use(express.json());

// 服务静态文件，把 index.html 展示出来
app.use(express.static('public'));

// 兑换接口
app.post('/redeem', async (req, res) => {
    const { licenseKey } = req.body;

    if (!licenseKey) {
        return res.status(400).json({ success: false, message: '授权码不能为空' });
    }

    // ========== 配置区域，你需要换成自己的 ==========
    const IDATARIVER_API_KEY = 'sk_2b96a88dd46495fcb197bb80ba09417f'; // 从iDataRiver商户后台获取
    const IDATARIVER_PRODUCT_ID = '69f0f28f5bf6c3d12b2aca72'; // 在项目里创建的商品ID

    const NEWAPI_BASE_URL = 'https://xycdd001.zeabur.app'; // 例如 https://new-api-xxxxx.zeabur.app
    const NEWAPI_ADMIN_KEY = 'MTxOWL+/JFo5E17VUe9WYhO3AQBq0s2W'; // 在New-API后台“系统设置”里生成
    // =============================================

    try {
        // 1. 验证授权码
        console.log(`验证授权码: ${licenseKey}`);
        const verifyResponse = await axios.get(`https://api.idatariver.com/v1/licenses/verify`, {
            params: {
                key: licenseKey,
                product_id: IDATARIVER_PRODUCT_ID
            },
            headers: {
                'Authorization': `Bearer ${IDATARIVER_API_KEY}`
            }
        });

        const licenseData = verifyResponse.data;

        if (!licenseData.valid) {
            return res.status(400).json({ success: false, message: '授权码无效或已被使用。' });
        }

        // 2. 授权码有效，调用New-API创建令牌
        console.log('授权码有效，正在生成API令牌...');
        const tokenResponse = await axios.post(`${NEWAPI_BASE_URL}/api/token/`, {
            name: `用户兑换-${licenseKey.substring(0, 8)}`, // 令牌名称，方便辨认
            remain_quota: 1000000, // 发放的额度，单位是美元。这里示例为1美元 = 100万Token的额
            unlimited_quota: false,
            // 可以根据iDataRiver返回的授权码元数据，动态设置不同套餐的额度
        }, {
            headers: {
                'Authorization': `Bearer ${NEWAPI_ADMIN_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const newToken = tokenResponse.data.data.key; // New-API返回的令牌

        console.log(`令牌生成成功: ${newToken}`);
        
        // 3. 将生成的令牌返回给用户
        res.json({
            success: true,
            message: '兑换成功！',
            apiKey: newToken
        });

    } catch (error) {
        console.error('兑换过程出错:', error.response?.data || error.message);
        let errorMessage = '兑换服务暂时不可用，请联系管理员。';
        if (error.response?.status === 404) {
            errorMessage = '验证服务未找到，请检查iDataRiver配置。';
        }
        res.status(500).json({ success: false, message: errorMessage });
    }
});

app.listen(port, () => {
    console.log(`兑换服务运行在 http://localhost:${port}`);
});