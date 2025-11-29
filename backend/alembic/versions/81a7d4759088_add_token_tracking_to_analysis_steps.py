"""add_token_tracking_to_analysis_steps

Revision ID: 81a7d4759088
Revises: da7b933e53e9
Create Date: 2025-11-28 07:56:34.895404

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision = '81a7d4759088'
down_revision = 'da7b933e53e9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    
    # Add new columns to analysis_steps table
    op.add_column('analysis_steps', sa.Column('input_tokens', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('analysis_steps', sa.Column('output_tokens', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('analysis_steps', sa.Column('provider', sa.String(length=100), nullable=True))
    op.add_column('analysis_steps', sa.Column('cost_per_1k_input', sa.Numeric(precision=10, scale=6), nullable=True))
    op.add_column('analysis_steps', sa.Column('cost_per_1k_output', sa.Numeric(precision=10, scale=6), nullable=True))
    
    # Migrate existing data:
    # - Set input_tokens = tokens_used (approximation)
    # - Set output_tokens = 0 (approximation)
    # - Set provider = 'openrouter' for all existing records
    conn.execute(
        text("""
            UPDATE analysis_steps 
            SET input_tokens = COALESCE(tokens_used, 0),
                output_tokens = 0,
                provider = 'openrouter'
            WHERE input_tokens IS NULL OR provider IS NULL
        """)
    )
    
    # Make columns NOT NULL after migration (set defaults for any NULL values)
    op.alter_column('analysis_steps', 'input_tokens',
                    existing_type=sa.Integer(),
                    nullable=False,
                    server_default='0')
    op.alter_column('analysis_steps', 'output_tokens',
                    existing_type=sa.Integer(),
                    nullable=False,
                    server_default='0')


def downgrade() -> None:
    # Remove added columns
    op.drop_column('analysis_steps', 'cost_per_1k_output')
    op.drop_column('analysis_steps', 'cost_per_1k_input')
    op.drop_column('analysis_steps', 'provider')
    op.drop_column('analysis_steps', 'output_tokens')
    op.drop_column('analysis_steps', 'input_tokens')
