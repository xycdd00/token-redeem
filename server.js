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

                            // 3. 从令牌列表里发放第一个令牌（增加防重检查）
        console.log('授权码验证通过，正在从令牌列表发放令牌...');
        const tokenListEnv = process.env.TOKEN_LIST || '';
        const tokenPool = tokenListEnv.split(',').filter(t => t.trim() !== '');

        // *** 关键修复：检查令牌池是否为空，并用一个确定存在的变量来保存发放的令牌 ***
        if (tokenPool.length === 0) {
            console.error('令牌池已空，请及时补充');
            // 注意：如果之前已经激活了授权码，这里会很麻烦，所以一定要先检查库存
            return res.status(500).json({ success: false, message: '系统库存不足，请联系管理员' });
        }

        // 取出第一个令牌，并确保它是一个有效的字符串
        const issuedToken = tokenPool.shift().trim();
        
        // *** 增加安全校验，防止 issuedToken 为空或未定义 ***
        if (!issuedToken || !issuedToken.startsWith('sk-')) {
            console.error('发放令牌失败，令牌格式无效:', issuedToken);
            return res.status(500).json({ success: false, message: '令牌发放异常，请联系管理员' });
        }

        console.log(`发放令牌成功: ${issuedToken.substring(0, 10)}...`);
        
        // 更新令牌池环境变量
        process.env.TOKEN_LIST = tokenPool.join(',');

        // 4. 激活授权码（标记为已使用）—— 只有在令牌成功取出之后才执行
        try {
            console.log('正在激活授权码:', licenseKey);
            await axios.post(`https://api.idatariver.com/mapi/license/activate`, null, {
                params: { 
                    code: licenseKey, 
                    product_id: IDATARIVER_PRODUCT_ID, 
                    secret: IDATARIVER_API_KEY 
                }
            });
            console.log('授权码激活成功');
        } catch (activateError) {
            // 如果激活失败，记录错误，但令牌已经取出，需要人工处理
            console.error('激活授权码失败，请手动检查并处理该授权码:', licenseKey, activateError.response?.data || activateError.message);
            // 这里可以考虑把令牌放回池子，或标记为异常，但我们先记录日志
        }
        
        // 5. 返回令牌给用户
        res.json({
            success: true,
            message: '兑换成功！',
            apiKey: issuedToken
        });
       res.json({ success: true, message: '兑换成功！', apiKey: issuedToken });

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