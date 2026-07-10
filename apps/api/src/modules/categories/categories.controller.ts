import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/roles.decorator';
import { CategoriesService } from './categories.service';

@ApiTags('Categories')
@Controller({ path: 'categories', version: '1' })
export class CategoriesController {
  constructor(private categories: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Civic category taxonomy (tree, locale names inline)' })
  tree() {
    return this.categories.tree();
  }
}
