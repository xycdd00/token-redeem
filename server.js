const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// ========== 从环境变量安全读取配置 ==========
const IDATARIVER_API_KEY = process.env.IDATARIVER_API_KEY;
const IDATARIVER_PRODUCT_ID = process.env.IDATARIVER_PRODUCT_ID;
const NEWAPI_BASE_URL = process.env.NEWAPI_BASE_URL;
const NEWAPI_ADMIN_KEY = process.env.NEWAPI_ADMIN_KEY;
// =============================================

app.post('/redeem', async (req, res) => {
    const { licenseKey } = req.body;

    if (!licenseKey) {
        return res.status(400).json({ success: false, message: '授权码不能为空' });
    }

    // 检查必要的环境变量是否配置
    if (!IDATARIVER_API_KEY || !IDATARIVER_PRODUCT_ID || !NEWAPI_BASE_URL || !NEWAPI_ADMIN_KEY) {
        console.error('缺少必要的环境变量配置，请检查 Zeabur 环境变量设置');
        return res.status(500).json({ success: false, message: '服务器配置错误，请联系管理员' });
    }

    try {
        // 1. 调用iDataRiver官方API验证授权码
        console.log(`正在验证授权码: ${licenseKey}`);
        const verifyResponse = await axios.get(`https://api.idatariver.com/mapi/license/query`, {
            params: {
                code: licenseKey,
                product_id: IDATARIVER_PRODUCT_ID
            },
            headers: {
                'Authorization': `Bearer ${IDATARIVER_API_KEY}`
            }
        });

        const licenseData = verifyResponse.data;
        console.log('iDataRiver 验证响应:', JSON.stringify(licenseData));

        // 检查授权码状态
        if (!licenseData.result || !licenseData.result.items || licenseData.result.items.length === 0) {
            return res.status(400).json({ success: false, message: '授权码无效或查询失败' });
        }
        
        const licenseItem = licenseData.result.items[0];
        if (licenseItem.status !== 'VALID') {
            return res.status(400).json({ success: false, message: '授权码无效或已被使用' });
        }

        // 2. 从业务参数中获取额度，默认为1000000
        let tokenQuota = 1000000;
        try {
            if (licenseItem.states) {
                const states = JSON.parse(licenseItem.states);
                if (states.quota) {
                    tokenQuota = states.quota;
                    console.log(`从业务参数中获取额度: ${tokenQuota}`);
                }
            }
        } catch (e) {
            console.log('无法解析业务参数，使用默认额度');
        }

        // 3. 授权码有效，调用New-API创建令牌
        console.log('授权码验证通过，正在生成API令牌...');
        const tokenResponse = await axios.post(`${NEWAPI_BASE_URL}/api/token/`, {
            name: `兑换-${licenseKey.substring(0, 8)}`,
            remain_quota: tokenQuota,
            unlimited_quota: false,
        }, {
            headers: {
                'Authorization': `Bearer ${NEWAPI_ADMIN_KEY}`,
                'Content-Type': 'application/json',
                'New-Api-User': process.env.NEWAPI_USER_ID
            }
        });

        const newToken = tokenResponse.data.data.key;
        console.log(`API令牌生成成功: ${newToken.substring(0, 10)}...`);

        // 4. 激活授权码（标记为已使用，防止重复兑换）
        try {
            await axios.post(`https://api.idatariver.com/mapi/license/activate`, {
                code: licenseKey,
                product_id: IDATARIVER_PRODUCT_ID
            }, {
                headers: {
                    'Authorization': `Bearer ${IDATARIVER_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log('授权码已激活');
        } catch (activateError) {
            console.error('激活授权码失败:', activateError.response?.data || activateError.message);
        }

        // 5. 返回令牌给用户
        res.json({
            success: true,
            message: '兑换成功！',
            apiKey: newToken
        });

    } catch (error) {
        console.error('兑换过程出错:', error.response?.data || error.message);
        
        let errorMessage = '兑换服务暂时不可用，请联系管理员。';
        if (error.response?.status === 400) {
            errorMessage = '授权码无效或已被使用';
        } else if (error.response?.status === 401) {
            errorMessage = 'API认证失败，请检查配置';
        } else if (error.response?.status === 404) {
            errorMessage = '验证服务未找到，请检查API地址配置';
        }
        
        res.status(500).json({ success: false, message: errorMessage });
    }
});

app.listen(port, () => {
    console.log(`兑换服务运行在 http://localhost:${port}`);
    console.log('环境变量状态:');
    console.log('- IDATARIVER_API_KEY:', IDATARIVER_API_KEY ? '✅ 已配置' : '❌ 未配置');
    console.log('- IDATARIVER_PRODUCT_ID:', IDATARIVER_PRODUCT_ID ? '✅ 已配置' : '❌ 未配置');
    console.log('- NEWAPI_BASE_URL:', NEWAPI_BASE_URL ? '✅ 已配置' : '❌ 未配置');
    console.log('- NEWAPI_ADMIN_KEY:', NEWAPI_ADMIN_KEY ? '✅ 已配置' : '❌ 未配置');
});