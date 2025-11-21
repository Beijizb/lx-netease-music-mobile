#!/bin/bash

# ============================================
# LX Music Android Keystore 生成脚本
# ============================================

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}LX Music Android Keystore 生成工具${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检查 keytool 是否可用
if ! command -v keytool &> /dev/null; then
    echo -e "${RED}错误: 未找到 keytool 命令${NC}"
    echo "请安装 Java JDK: sudo apt-get install openjdk-11-jdk"
    exit 1
fi

# 检查 base64 是否可用
if ! command -v base64 &> /dev/null; then
    echo -e "${RED}错误: 未找到 base64 命令${NC}"
    exit 1
fi

# 配置参数（可以修改这些值）
KEYSTORE_NAME="lx-music-release-key.keystore"
KEY_ALIAS="lx-music-key"
VALIDITY_DAYS=10000

# 提示用户输入信息
echo -e "${YELLOW}请输入以下信息（直接回车使用默认值）:${NC}"
echo ""

read -p "Keystore 文件名 [${KEYSTORE_NAME}]: " input_keystore
KEYSTORE_NAME=${input_keystore:-$KEYSTORE_NAME}

read -p "Key Alias [${KEY_ALIAS}]: " input_alias
KEY_ALIAS=${input_alias:-$KEY_ALIAS}

read -sp "Store Password (输入时不会显示): " STORE_PASSWORD
echo ""
if [ -z "$STORE_PASSWORD" ]; then
    echo -e "${RED}错误: Store Password 不能为空${NC}"
    exit 1
fi

read -sp "Key Password (输入时不会显示，通常与 Store Password 相同): " KEY_PASSWORD
echo ""
KEY_PASSWORD=${KEY_PASSWORD:-$STORE_PASSWORD}

read -p "您的姓名/组织 [LX Music]: " CN_NAME
CN_NAME=${CN_NAME:-"LX Music"}

read -p "组织单位 [Development]: " OU_NAME
OU_NAME=${OU_NAME:-"Development"}

read -p "组织名称 [LX Music]: " O_NAME
O_NAME=${O_NAME:-"LX Music"}

read -p "城市 [Beijing]: " L_NAME
L_NAME=${L_NAME:-"Beijing"}

read -p "省份/州 [Beijing]: " ST_NAME
ST_NAME=${ST_NAME:-"Beijing"}

read -p "国家代码 [CN]: " C_NAME
C_NAME=${C_NAME:-"CN"}

# 构建 DN (Distinguished Name)
DN="CN=${CN_NAME}, OU=${OU_NAME}, O=${O_NAME}, L=${L_NAME}, ST=${ST_NAME}, C=${C_NAME}"

echo ""
echo -e "${BLUE}开始生成 Keystore...${NC}"

# 如果文件已存在，询问是否覆盖
if [ -f "$KEYSTORE_NAME" ]; then
    read -p "文件 ${KEYSTORE_NAME} 已存在，是否覆盖? (y/N): " overwrite
    if [[ ! "$overwrite" =~ ^[Yy]$ ]]; then
        echo "已取消操作"
        exit 0
    fi
    rm -f "$KEYSTORE_NAME"
fi

# 生成 keystore
keytool -genkeypair -v \
    -storetype PKCS12 \
    -keystore "$KEYSTORE_NAME" \
    -alias "$KEY_ALIAS" \
    -storepass "$STORE_PASSWORD" \
    -keypass "$KEY_PASSWORD" \
    -keyalg RSA \
    -keysize 2048 \
    -validity $VALIDITY_DAYS \
    -dname "$DN"

if [ $? -ne 0 ]; then
    echo -e "${RED}错误: Keystore 生成失败${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Keystore 生成成功: ${KEYSTORE_NAME}${NC}"

# 转换为 base64
echo -e "${BLUE}正在转换为 Base64...${NC}"
KEYSTORE_BASE64=$(base64 -w 0 "$KEYSTORE_NAME")

if [ $? -ne 0 ]; then
    # macOS 的 base64 不支持 -w 参数
    KEYSTORE_BASE64=$(base64 "$KEYSTORE_NAME" | tr -d '\n')
fi

echo -e "${GREEN}✓ Base64 转换成功${NC}"

# 输出结果
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}生成完成！请将以下信息添加到 GitHub Secrets${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}1. 进入 GitHub 仓库设置:${NC}"
echo "   https://github.com/Beijizb/lx-netease-music-mobile/settings/secrets/actions"
echo ""
echo -e "${YELLOW}2. 点击 'New repository secret' 添加以下 5 个 Secret:${NC}"
echo ""

# 输出 Secret 信息
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Secret 1: MYAPP_KEYSTORE_BASE64${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "$KEYSTORE_BASE64"
echo ""

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Secret 2: MYAPP_UPLOAD_STORE_FILE${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "$KEYSTORE_NAME"
echo ""

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Secret 3: MYAPP_UPLOAD_KEY_ALIAS${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "$KEY_ALIAS"
echo ""

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Secret 4: MYAPP_UPLOAD_STORE_PASSWORD${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "$STORE_PASSWORD"
echo ""

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Secret 5: MYAPP_UPLOAD_KEY_PASSWORD${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "$KEY_PASSWORD"
echo ""

# 保存到文件（可选）
read -p "是否将信息保存到文件? (y/N): " save_file
if [[ "$save_file" =~ ^[Yy]$ ]]; then
    OUTPUT_FILE="keystore-info.txt"
    cat > "$OUTPUT_FILE" << EOF
========================================
LX Music Android Keystore 信息
生成时间: $(date)
========================================

GitHub Secrets 配置信息:

1. MYAPP_KEYSTORE_BASE64
$KEYSTORE_BASE64

2. MYAPP_UPLOAD_STORE_FILE
$KEYSTORE_NAME

3. MYAPP_UPLOAD_KEY_ALIAS
$KEY_ALIAS

4. MYAPP_UPLOAD_STORE_PASSWORD
$STORE_PASSWORD

5. MYAPP_UPLOAD_KEY_PASSWORD
$KEY_PASSWORD

========================================
重要提示:
1. 请妥善保管 keystore 文件和密码
2. 不要将 keystore 文件提交到 Git
3. 丢失 keystore 后将无法更新已发布的应用
4. 建议备份 keystore 文件到安全位置
========================================
EOF
    echo -e "${GREEN}✓ 信息已保存到: ${OUTPUT_FILE}${NC}"
    echo -e "${YELLOW}⚠ 注意: 此文件包含敏感信息，请妥善保管！${NC}"
fi

echo ""
echo -e "${YELLOW}⚠ 安全提示:${NC}"
echo "  1. 请妥善保管 ${KEYSTORE_NAME} 文件和密码"
echo "  2. 不要将 keystore 文件提交到 Git 仓库"
echo "  3. 建议备份 keystore 文件到安全位置"
echo "  4. 丢失 keystore 后将无法更新已发布的应用"
echo ""
echo -e "${GREEN}完成！${NC}"

