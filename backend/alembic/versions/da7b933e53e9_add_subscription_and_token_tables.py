"""add_subscription_and_token_tables

Revision ID: da7b933e53e9
Revises: 4b2a51f11416
Create Date: 2025-11-28 07:53:59.704221

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


# revision identifiers, used by Alembic.
revision = 'da7b933e53e9'
down_revision = '4b2a51f11416'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create subscription_plans table
    op.create_table(
        'subscription_plans',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('display_name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('monthly_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('included_features', mysql.JSON(), nullable=False),
        sa.Column('price_monthly', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('price_currency', sa.String(length=3), nullable=False, server_default='USD'),
        sa.Column('is_trial', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('trial_duration_days', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('is_visible', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    op.create_index('ix_subscription_plans_id', 'subscription_plans', ['id'], unique=False)
    op.create_index('ix_subscription_plans_name', 'subscription_plans', ['name'], unique=True)

    # Create user_subscriptions table
    op.create_table(
        'user_subscriptions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=False),
        sa.Column('plan_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('trial_ends_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('tokens_allocated', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('tokens_used_this_period', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('period_start_date', sa.Date(), nullable=False),
        sa.Column('period_end_date', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['plan_id'], ['subscription_plans.id'])
    )
    op.create_index('ix_user_subscriptions_id', 'user_subscriptions', ['id'], unique=False)
    op.create_index('idx_user_org', 'user_subscriptions', ['user_id', 'organization_id'], unique=False)
    op.create_index('idx_status', 'user_subscriptions', ['status'], unique=False)
    op.create_index('idx_expires_at', 'user_subscriptions', ['expires_at'], unique=False)

    # Create token_packages table
    op.create_table(
        'token_packages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('display_name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('token_amount', sa.Integer(), nullable=False),
        sa.Column('price_rub', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('is_visible', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    op.create_index('ix_token_packages_id', 'token_packages', ['id'], unique=False)
    op.create_index('ix_token_packages_name', 'token_packages', ['name'], unique=True)

    # Create token_purchases table
    op.create_table(
        'token_purchases',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=False),
        sa.Column('package_id', sa.Integer(), nullable=False),
        sa.Column('token_amount', sa.Integer(), nullable=False),
        sa.Column('price_rub', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('purchased_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['package_id'], ['token_packages.id'])
    )
    op.create_index('ix_token_purchases_id', 'token_purchases', ['id'], unique=False)
    op.create_index('idx_user_org', 'token_purchases', ['user_id', 'organization_id'], unique=False)
    op.create_index('idx_purchased_at', 'token_purchases', ['purchased_at'], unique=False)

    # Create token_balances table
    op.create_table(
        'token_balances',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=False),
        sa.Column('balance', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('user_id', 'organization_id', name='uk_user_org')
    )
    op.create_index('ix_token_balances_id', 'token_balances', ['id'], unique=False)
    op.create_index('idx_user_org', 'token_balances', ['user_id', 'organization_id'], unique=False)

    # Create token_consumption table
    op.create_table(
        'token_consumption',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=False),
        sa.Column('run_id', sa.Integer(), nullable=True),
        sa.Column('step_id', sa.Integer(), nullable=True),
        sa.Column('rag_query_id', sa.Integer(), nullable=True),
        sa.Column('model_name', sa.String(length=200), nullable=False),
        sa.Column('provider', sa.String(length=100), nullable=False),
        sa.Column('input_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('output_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_tokens', sa.Integer(), nullable=False),
        sa.Column('cost_per_1k_input_usd', sa.Numeric(precision=10, scale=6), nullable=False),
        sa.Column('cost_per_1k_output_usd', sa.Numeric(precision=10, scale=6), nullable=False),
        sa.Column('price_per_1k_usd', sa.Numeric(precision=10, scale=6), nullable=False),
        sa.Column('exchange_rate_usd_to_rub', sa.Numeric(precision=10, scale=4), nullable=False),
        sa.Column('cost_rub', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('price_rub', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('source_type', sa.String(length=50), nullable=False),
        sa.Column('tokens_charged', sa.Integer(), nullable=False),
        sa.Column('consumed_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['run_id'], ['analysis_runs.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['step_id'], ['analysis_steps.id'], ondelete='SET NULL')
    )
    op.create_index('ix_token_consumption_id', 'token_consumption', ['id'], unique=False)
    op.create_index('idx_user_org', 'token_consumption', ['user_id', 'organization_id'], unique=False)
    op.create_index('idx_consumed_at', 'token_consumption', ['consumed_at'], unique=False)
    op.create_index('idx_model', 'token_consumption', ['model_name'], unique=False)
    op.create_index('idx_provider', 'token_consumption', ['provider'], unique=False)

    # Create model_pricing table
    op.create_table(
        'model_pricing',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('model_name', sa.String(length=200), nullable=False),
        sa.Column('provider', sa.String(length=100), nullable=False),
        sa.Column('cost_per_1k_input_usd', sa.Numeric(precision=10, scale=6), nullable=False),
        sa.Column('cost_per_1k_output_usd', sa.Numeric(precision=10, scale=6), nullable=False),
        sa.Column('platform_fee_percent', sa.Numeric(precision=5, scale=2), nullable=False, server_default='40.00'),
        sa.Column('price_per_1k_usd', sa.Numeric(precision=10, scale=6), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('is_visible', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('model_name', 'provider', name='uk_model_provider')
    )
    op.create_index('ix_model_pricing_id', 'model_pricing', ['id'], unique=False)
    op.create_index('idx_provider', 'model_pricing', ['provider'], unique=False)
    op.create_index('idx_is_active', 'model_pricing', ['is_active'], unique=False)

    # Create provider_credentials table
    op.create_table(
        'provider_credentials',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('provider', sa.String(length=100), nullable=False),
        sa.Column('display_name', sa.String(length=200), nullable=False),
        sa.Column('api_key_encrypted', sa.Text(), nullable=True),
        sa.Column('base_url', sa.String(length=500), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('provider')
    )
    op.create_index('ix_provider_credentials_id', 'provider_credentials', ['id'], unique=False)
    op.create_index('ix_provider_credentials_provider', 'provider_credentials', ['provider'], unique=True)


def downgrade() -> None:
    # Drop tables in reverse order (respecting foreign key dependencies)
    op.drop_table('provider_credentials')
    op.drop_table('model_pricing')
    op.drop_table('token_consumption')
    op.drop_table('token_balances')
    op.drop_table('token_purchases')
    op.drop_table('token_packages')
    op.drop_table('user_subscriptions')
    op.drop_table('subscription_plans')
