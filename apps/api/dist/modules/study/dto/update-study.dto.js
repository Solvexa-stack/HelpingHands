"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateStudyDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const create_study_dto_1 = require("./create-study.dto");
class UpdateStudyDto extends (0, swagger_1.PartialType)(create_study_dto_1.CreateStudyDto) {
}
exports.UpdateStudyDto = UpdateStudyDto;
//# sourceMappingURL=update-study.dto.js.map